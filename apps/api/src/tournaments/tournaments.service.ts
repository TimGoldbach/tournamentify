import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  CapabilityLinkDto,
  CreateTournamentInput,
  DesignTokens,
  ScoreInput,
  SETUP_SCHEMA_VERSION,
  TournamentDetailDto,
  TournamentSetup,
  TournamentSummaryDto,
  designTokensSchema,
} from "@tournamentify/shared";
import { BracketGenerator } from "../bracket/bracket-generator.service";
import {
  AdvancementUpdate,
  MatchView,
  byeAdvancements,
  loserAdvancement,
  parseSlot,
  winnerAdvancement,
} from "../bracket/progression";
import { GeneratedSlot } from "../bracket/types";
import { toDomainStageType, toPrismaStageType } from "../bracket/stage-type";
import { Actor } from "../common/current-actor.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { EventsService } from "./events.service";
import { LinksService } from "./links.service";
import { buildMatchViews, toDetail, toSummary, TournamentDetailRow } from "./tournament.mapper";

type TxClient = Prisma.TransactionClient;

/** Full include tree needed to build a TournamentDetailDto. */
const detailInclude = {
  participants: { orderBy: { seed: "asc" } },
  stages: {
    orderBy: { number: "asc" },
    include: {
      groups: {
        orderBy: { number: "asc" },
        include: {
          rounds: {
            orderBy: { number: "asc" },
            include: {
              matches: { orderBy: { number: "asc" } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.TournamentInclude;

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: BracketGenerator,
    private readonly links: LinksService,
    private readonly events: EventsService,
  ) {}

  async create(actor: Actor, input: CreateTournamentInput): Promise<TournamentDetailDto> {
    if (!actor.userId && !actor.anonToken) {
      throw new BadRequestException("An owner (user or anonymous token) is required");
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.create({
        data: {
          name: input.name,
          status: "DRAFT",
          ownerUserId: actor.userId ?? null,
          anonOwnerToken: actor.userId ? null : (actor.anonToken ?? null),
          designTokens: (input.design ?? {}) as Prisma.InputJsonValue,
        },
      });

      // Persist participants in input order, remembering each row id by index so
      // generated slots (which reference 0-based participantIndex) can resolve.
      const idByIndex: string[] = [];
      for (const [index, participant] of input.participants.entries()) {
        const created = await tx.participant.create({
          data: {
            tournamentId: tournament.id,
            name: participant.name,
            seed: participant.seed ?? index + 1,
          },
        });
        idByIndex[index] = created.id;
      }

      await this.generateAndPersistStages(tx, tournament.id, input.stages, idByIndex);
      await this.autoAdvanceByes(tx, tournament.id);

      return tournament.id;
    });

    return this.loadDetail(id, true);
  }

  /**
   * Regenerate the bracket from a new seeding order (DRAFT only). The set of
   * participant ids must be identical to the tournament's current one — this is
   * a reorder, not an add/remove. Existing stages are dropped and rebuilt from
   * their stored setups in the new participant order, then byes are settled.
   */
  async reseed(
    actor: Actor,
    id: string,
    participantIds: string[],
  ): Promise<TournamentDetailDto> {
    await this.assertOwner(id, actor);

    // Everything that guards and performs the destructive regenerate runs in one
    // transaction, so a concurrent score() can't slip a real result past the lock.
    await this.prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.findUniqueOrThrow({
        where: { id },
        include: {
          participants: true,
          stages: { orderBy: { number: "asc" } },
        },
      });

      // Lock once a real result exists. Auto-advanced byes are COMPLETED but
      // carry no score, so they must NOT lock the seeding.
      const scored = await this.countScored(tx, id);
      if (scored > 0) {
        throw new BadRequestException("Setzliste gesperrt");
      }

      // The new order must be a permutation of the existing participant ids:
      // same length and same set (no additions, removals, or duplicates).
      const existingIds = new Set(tournament.participants.map((p) => p.id));
      const uniqueIncoming = new Set(participantIds);
      if (
        participantIds.length !== existingIds.size ||
        uniqueIncoming.size !== participantIds.length ||
        participantIds.some((pid) => !existingIds.has(pid))
      ) {
        throw new BadRequestException("Ungueltige Setzliste");
      }

      // Reuse the stored setups (type + name + format settings) but drive
      // generation from the *new* participant order.
      const stageSetups: TournamentSetup["stages"] = tournament.stages.map((stage) => ({
        type: toDomainStageType(stage.type),
        name: settingsName(stage.settings),
        settings: stripStageName(stage.settings),
      }));

      // Apply the new seeds (1-based index in the supplied order).
      for (const [index, participantId] of participantIds.entries()) {
        await tx.participant.update({
          where: { id: participantId },
          data: { seed: index + 1 },
        });
      }

      // Drop all stages — cascades remove groups/rounds/matches.
      await tx.stage.deleteMany({ where: { tournamentId: id } });

      await this.generateAndPersistStages(tx, id, stageSetups, participantIds);
      await this.autoAdvanceByes(tx, id);
      await this.recomputeStatus(tx, id);
    });

    this.events.emit(id);
    return this.loadDetail(id, true);
  }

  /**
   * Generate each stage's bracket and persist the Stage/Group/Round/Match rows.
   * `idByIndex` maps the 0-based participantIndex emitted by the generator onto
   * concrete Participant ids; its length is the participant count fed to the
   * generator. Shared by create() and reseed().
   */
  private async generateAndPersistStages(
    tx: TxClient,
    tournamentId: string,
    stages: TournamentSetup["stages"],
    idByIndex: string[],
  ): Promise<void> {
    for (const [stageIndex, stageSetup] of stages.entries()) {
      const generated = this.generator.generateStage(stageSetup, idByIndex.length);
      const stage = await tx.stage.create({
        data: {
          tournamentId,
          type: toPrismaStageType(stageSetup.type),
          number: stageIndex + 1,
          // Carry the display name inside settings — Stage has no name column.
          settings: {
            ...stageSetup.settings,
            name: stageSetup.name,
          } as Prisma.InputJsonValue,
        },
      });

      for (const group of generated.groups) {
        const groupRow = await tx.group.create({
          data: { stageId: stage.id, number: group.number },
        });

        for (const round of group.rounds) {
          const roundRow = await tx.round.create({
            data: {
              groupId: groupRow.id,
              number: round.number,
              nameOverride: round.name,
              bestOf: 1,
            },
          });

          for (const match of round.matches) {
            await tx.match.create({
              data: {
                roundId: roundRow.id,
                number: match.number,
                status: "PENDING",
                opponent1: slotToJson(match.opponent1, idByIndex),
                opponent2: slotToJson(match.opponent2, idByIndex),
              },
            });
          }
        }
      }
    }
  }

  async list(actor: Actor): Promise<TournamentSummaryDto[]> {
    if (!actor.userId && !actor.anonToken) {
      throw new BadRequestException("An actor (user or anonymous token) is required");
    }

    const where: Prisma.TournamentWhereInput = actor.userId
      ? { ownerUserId: actor.userId }
      : { anonOwnerToken: actor.anonToken };

    const tournaments = await this.prisma.tournament.findMany({
      where,
      include: {
        participants: { select: { id: true } },
        stages: { select: { type: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return tournaments.map(toSummary);
  }

  async getById(id: string, actor: Actor, token?: string): Promise<TournamentDetailDto> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!tournament) {
      throw new NotFoundException("Tournament not found");
    }

    const owner = isOwner(tournament, actor);
    let viewerCanScore = owner;
    if (!owner) {
      const link = token ? await this.links.resolve(id, token) : null;
      if (!link) {
        // Do not reveal that the tournament exists to non-owners without a token.
        throw new NotFoundException("Tournament not found");
      }
      viewerCanScore = link.type === "SCORE";
    }

    return toDetail(tournament as TournamentDetailRow, viewerCanScore);
  }

  async remove(id: string, actor: Actor): Promise<void> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      select: { id: true, ownerUserId: true, anonOwnerToken: true },
    });
    if (!tournament) {
      throw new NotFoundException("Tournament not found");
    }
    if (!isOwner(tournament, actor)) {
      throw new ForbiddenException("Not the owner of this tournament");
    }
    await this.prisma.tournament.delete({ where: { id } });
  }

  async exportSetup(id: string, actor: Actor): Promise<TournamentSetup> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        participants: { orderBy: { seed: "asc" } },
        stages: { orderBy: { number: "asc" } },
      },
    });
    if (!tournament) {
      throw new NotFoundException("Tournament not found");
    }
    if (!isOwner(tournament, actor)) {
      throw new ForbiddenException("Not the owner of this tournament");
    }

    const parsedDesign = designTokensSchema.safeParse(tournament.designTokens);

    return {
      schemaVersion: SETUP_SCHEMA_VERSION,
      name: tournament.name,
      stages: tournament.stages.map((stage) => ({
        type: toDomainStageType(stage.type),
        name: settingsName(stage.settings),
        settings: stripStageName(stage.settings),
      })),
      participants: tournament.participants.map((participant) => ({
        name: participant.name,
        seed: participant.seed ?? undefined,
      })),
      design: parsedDesign.success ? parsedDesign.data : undefined,
    };
  }

  async importSetup(actor: Actor, setup: TournamentSetup): Promise<TournamentDetailDto> {
    const { schemaVersion: _schemaVersion, ...input } = setup;
    return this.create(actor, input);
  }

  async claim(userId: string, anonToken: string): Promise<{ claimed: number }> {
    const result = await this.prisma.tournament.updateMany({
      where: { anonOwnerToken: anonToken },
      data: { ownerUserId: userId, anonOwnerToken: null },
    });
    return { claimed: result.count };
  }

  async createLink(
    id: string,
    actor: Actor,
    type: "VIEW" | "SCORE",
    expiresInHours?: number,
  ): Promise<CapabilityLinkDto> {
    await this.assertOwner(id, actor);
    return this.links.create(id, type, expiresInHours);
  }

  async listLinks(id: string, actor: Actor): Promise<CapabilityLinkDto[]> {
    await this.assertOwner(id, actor);
    return this.links.list(id);
  }

  async revokeLink(id: string, actor: Actor, linkId: string): Promise<void> {
    await this.assertOwner(id, actor);
    await this.links.revoke(id, linkId);
  }

  /**
   * Enter a score for a match and propagate the consequences. Authorized for the
   * owner or a valid SCORE link. Both opponents must already be resolved
   * participants; elimination matches may not end in a draw. On success the
   * winner is advanced (elimination), the tournament status is recomputed, and a
   * change signal is emitted after the transaction commits.
   */
  async score(
    actor: Actor,
    tournamentId: string,
    matchId: string,
    input: ScoreInput,
    token?: string,
  ): Promise<TournamentDetailDto> {
    await this.assertCanScore(tournamentId, actor, token);

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { round: { include: { group: { include: { stage: true } } } } },
    });
    if (!match || match.round.group.stage.tournamentId !== tournamentId) {
      throw new NotFoundException("Match not found");
    }
    if (match.status === "COMPLETED") {
      // Re-scoring a finished match would leave already-advanced winners stale
      // downstream; not supported in M2 (result correction is an M2.1 concern).
      throw new BadRequestException("Match wurde bereits gewertet");
    }

    const slot1 = parseSlot(match.opponent1);
    const slot2 = parseSlot(match.opponent2);
    if (
      slot1 === null ||
      slot2 === null ||
      !("participantId" in slot1) ||
      !("participantId" in slot2)
    ) {
      throw new BadRequestException("Match not ready");
    }

    const stageType = toDomainStageType(match.round.group.stage.type);
    const isElimination =
      stageType === "single_elimination" || stageType === "double_elimination";

    let winnerParticipantId: string | null;
    if (input.opponent1Score > input.opponent2Score) {
      winnerParticipantId = slot1.participantId;
    } else if (input.opponent1Score < input.opponent2Score) {
      winnerParticipantId = slot2.participantId;
    } else {
      if (isElimination) {
        throw new BadRequestException("Elimination matches cannot end in a draw");
      }
      winnerParticipantId = null;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: match.id },
        data: {
          status: "COMPLETED",
          opponent1: { participantId: slot1.participantId, score: input.opponent1Score },
          opponent2: { participantId: slot2.participantId, score: input.opponent2Score },
        },
      });

      if (isElimination && winnerParticipantId) {
        // Scan the group for downstream slots that source from this match and
        // seat the winner. The completed match itself never sources from itself,
        // so re-reading it here (now a scored participant) is harmless.
        const views = await this.loadGroupMatchViews(tx, match.round.groupId);
        const updates = winnerAdvancement(
          { matches: views },
          {
            roundNumber: match.round.number,
            matchNumber: match.number,
            winnerParticipantId,
          },
        );
        await this.applyAdvancements(tx, updates);

        // Double-elimination also drops the loser into the loser bracket. The
        // loser is whichever resolved opponent did not win. For single
        // elimination there are no loser_of consumers, so this is a no-op.
        const loserParticipantId =
          winnerParticipantId === slot1.participantId
            ? slot2.participantId
            : slot1.participantId;
        const loserUpdates = loserAdvancement(
          { matches: views },
          {
            roundNumber: match.round.number,
            matchNumber: match.number,
            loserParticipantId,
          },
        );
        await this.applyAdvancements(tx, loserUpdates);
      }

      await this.recomputeStatus(tx, tournamentId);
    });

    this.events.emit(tournamentId);
    return this.loadDetail(tournamentId, true);
  }

  /** Owner-only: persist a new design-token set and return the refreshed detail. */
  async updateDesign(
    actor: Actor,
    id: string,
    tokens: DesignTokens,
  ): Promise<TournamentDetailDto> {
    await this.assertOwner(id, actor);
    await this.prisma.tournament.update({
      where: { id },
      data: { designTokens: tokens as Prisma.InputJsonValue },
    });
    return this.loadDetail(id, true);
  }

  /** Owner OR a valid SCORE link may score. Otherwise 404 (hide) / 403 (deny). */
  async assertCanScore(id: string, actor: Actor, token?: string): Promise<void> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      select: { id: true, ownerUserId: true, anonOwnerToken: true },
    });
    if (!tournament) {
      throw new NotFoundException("Tournament not found");
    }
    if (isOwner(tournament, actor)) {
      return;
    }
    const link = token ? await this.links.resolve(id, token) : null;
    if (!link) {
      throw new NotFoundException("Tournament not found");
    }
    if (link.type !== "SCORE") {
      throw new ForbiddenException("This link does not grant scoring access");
    }
  }

  /** Owner OR any valid link (VIEW or SCORE) may subscribe / view. */
  async assertCanView(id: string, actor: Actor, token?: string): Promise<void> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      select: { id: true, ownerUserId: true, anonOwnerToken: true },
    });
    if (!tournament) {
      throw new NotFoundException("Tournament not found");
    }
    if (isOwner(tournament, actor)) {
      return;
    }
    const link = token ? await this.links.resolve(id, token) : null;
    if (!link) {
      throw new NotFoundException("Tournament not found");
    }
  }

  private async assertOwner(id: string, actor: Actor): Promise<void> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      select: { id: true, ownerUserId: true, anonOwnerToken: true },
    });
    if (!tournament) {
      throw new NotFoundException("Tournament not found");
    }
    if (!isOwner(tournament, actor)) {
      throw new ForbiddenException("Not the owner of this tournament");
    }
  }

  private async loadDetail(id: string, viewerCanScore: boolean): Promise<TournamentDetailDto> {
    const tournament = await this.prisma.tournament.findUniqueOrThrow({
      where: { id },
      include: detailInclude,
    });
    return toDetail(tournament as TournamentDetailRow, viewerCanScore);
  }

  /**
   * Right after generation, settle any first-round byes: the lone participant
   * auto-wins (match COMPLETED, no score) and is seated into its downstream slot.
   * Standard seeding only produces single-sided byes in round 1, so one pass per
   * elimination group is sufficient. Round-robin groups have no byes to settle.
   */
  private async autoAdvanceByes(tx: TxClient, tournamentId: string): Promise<void> {
    const groups = await tx.group.findMany({
      where: { stage: { tournamentId } },
      include: {
        stage: true,
        rounds: { orderBy: { number: "asc" }, include: { matches: { orderBy: { number: "asc" } } } },
      },
    });

    for (const group of groups) {
      const stageType = toDomainStageType(group.stage.type);
      if (stageType !== "single_elimination" && stageType !== "double_elimination") {
        continue;
      }

      const views = buildMatchViews(group);
      for (const bye of byeAdvancements({ matches: views })) {
        await tx.match.update({
          where: { id: bye.matchId },
          data: { status: "COMPLETED" },
        });
        await this.applyAdvancements(tx, bye.advance);
      }
    }

    await this.recomputeStatus(tx, tournamentId);
  }

  /** Load a group's matches as the MatchView[] the progression code expects. */
  private async loadGroupMatchViews(tx: TxClient, groupId: string): Promise<MatchView[]> {
    const group = await tx.group.findUniqueOrThrow({
      where: { id: groupId },
      include: {
        rounds: { orderBy: { number: "asc" }, include: { matches: { orderBy: { number: "asc" } } } },
      },
    });
    return buildMatchViews(group);
  }

  /** Seat advanced participants into their downstream opponent slots. */
  private async applyAdvancements(tx: TxClient, updates: AdvancementUpdate[]): Promise<void> {
    for (const update of updates) {
      await tx.match.update({
        where: { id: update.matchId },
        data: { [update.slot]: { participantId: update.participantId } },
      });
    }
  }

  /** Count COMPLETED matches that carry actual entered scores (excludes byes). */
  private async countScored(tx: TxClient, tournamentId: string): Promise<number> {
    const matches = await tx.match.findMany({
      where: { status: "COMPLETED", round: { group: { stage: { tournamentId } } } },
      select: { opponent1: true, opponent2: true },
    });
    return matches.filter((m) => isScored(m.opponent1, m.opponent2)).length;
  }

  /**
   * Derive the tournament status from its matches: COMPLETED when every match is
   * COMPLETED, RUNNING once a genuinely played match exists, otherwise DRAFT.
   * Auto-advanced byes are COMPLETED but unscored, so they keep a fresh bracket
   * in DRAFT rather than flipping it to RUNNING. Idempotent.
   */
  private async recomputeStatus(tx: TxClient, tournamentId: string): Promise<void> {
    const [total, completed, scored] = await Promise.all([
      tx.match.count({ where: { round: { group: { stage: { tournamentId } } } } }),
      tx.match.count({
        where: { status: "COMPLETED", round: { group: { stage: { tournamentId } } } },
      }),
      this.countScored(tx, tournamentId),
    ]);

    let status: "DRAFT" | "RUNNING" | "COMPLETED";
    if (total > 0 && completed === total) {
      status = "COMPLETED";
    } else if (scored > 0) {
      status = "RUNNING";
    } else {
      status = "DRAFT";
    }

    await tx.tournament.update({ where: { id: tournamentId }, data: { status } });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOwner(
  tournament: { ownerUserId: string | null; anonOwnerToken: string | null },
  actor: Actor,
): boolean {
  if (actor.userId && tournament.ownerUserId === actor.userId) {
    return true;
  }
  if (actor.anonToken && tournament.anonOwnerToken === actor.anonToken) {
    return true;
  }
  return false;
}

/** Map a generated slot onto the JSON shape the mapper reads back. */
function slotToJson(slot: GeneratedSlot, idByIndex: string[]): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  switch (slot.kind) {
    case "participant": {
      const participantId =
        slot.participantIndex !== undefined ? idByIndex[slot.participantIndex] : undefined;
      if (!participantId) {
        return Prisma.JsonNull;
      }
      return { participantId };
    }
    case "bye":
      return { bye: true };
    case "source":
      return slot.source ? { source: { ...slot.source } } : Prisma.JsonNull;
    case "empty":
      return Prisma.JsonNull;
    default: {
      const _exhaustive: never = slot.kind;
      return _exhaustive;
    }
  }
}

/** A match counts as genuinely played only when BOTH opponents carry a numeric
 * score. Auto-advanced byes are COMPLETED but unscored, so they return false. */
function isScored(opponent1: unknown, opponent2: unknown): boolean {
  const a = parseSlot(opponent1);
  const b = parseSlot(opponent2);
  return (
    a !== null &&
    "participantId" in a &&
    typeof a.score === "number" &&
    b !== null &&
    "participantId" in b &&
    typeof b.score === "number"
  );
}

function settingsName(settings: Prisma.JsonValue): string {
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    const name = (settings as Record<string, unknown>).name;
    if (typeof name === "string" && name.length > 0) {
      return name;
    }
  }
  return "Hauptrunde";
}

/** Strip the synthetic `name` key so exported settings round-trip cleanly. */
function stripStageName(settings: Prisma.JsonValue): Record<string, unknown> {
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    const { name: _name, ...rest } = settings as Record<string, unknown>;
    return rest;
  }
  return {};
}
