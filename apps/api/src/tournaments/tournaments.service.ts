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
  SETUP_SCHEMA_VERSION,
  TournamentDetailDto,
  TournamentSetup,
  TournamentSummaryDto,
  designTokensSchema,
} from "@tournamentify/shared";
import { BracketGenerator } from "../bracket/bracket-generator.service";
import { GeneratedSlot } from "../bracket/types";
import { toDomainStageType, toPrismaStageType } from "../bracket/stage-type";
import { Actor } from "../common/current-actor.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { LinksService } from "./links.service";
import { toDetail, toSummary, TournamentDetailRow } from "./tournament.mapper";

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

      for (const [stageIndex, stageSetup] of input.stages.entries()) {
        const generated = this.generator.generateStage(stageSetup, input.participants.length);
        const stage = await tx.stage.create({
          data: {
            tournamentId: tournament.id,
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

      return tournament.id;
    });

    return this.loadDetail(id);
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

    if (!isOwner(tournament, actor)) {
      const link = token ? await this.links.resolve(id, token) : null;
      if (!link) {
        // Do not reveal that the tournament exists to non-owners without a token.
        throw new NotFoundException("Tournament not found");
      }
    }

    return toDetail(tournament as TournamentDetailRow);
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

  async createLink(id: string, actor: Actor, type: "VIEW" | "SCORE"): Promise<CapabilityLinkDto> {
    await this.assertOwner(id, actor);
    return this.links.create(id, type);
  }

  async listLinks(id: string, actor: Actor): Promise<CapabilityLinkDto[]> {
    await this.assertOwner(id, actor);
    return this.links.list(id);
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

  private async loadDetail(id: string): Promise<TournamentDetailDto> {
    const tournament = await this.prisma.tournament.findUniqueOrThrow({
      where: { id },
      include: detailInclude,
    });
    return toDetail(tournament as TournamentDetailRow);
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
