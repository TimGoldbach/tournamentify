import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UsePipes,
} from "@nestjs/common";
import {
  CapabilityLinkDto,
  CreateCapabilityLinkInput,
  CreateTournamentInput,
  MatchUpdateEvent,
  ScoreInput,
  TournamentDetailDto,
  TournamentSetup,
  TournamentSummaryDto,
  UpdateDesignInput,
  createCapabilityLinkInputSchema,
  createTournamentInputSchema,
  importSetupInputSchema,
  scoreInputSchema,
  updateDesignInputSchema,
} from "@tournamentify/shared";
import { Observable, from } from "rxjs";
import { switchMap } from "rxjs/operators";
import { Actor, CurrentActor } from "../common/current-actor.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { EventsService } from "./events.service";
import { TournamentsService } from "./tournaments.service";

@Controller("tournaments")
export class TournamentsController {
  constructor(
    private readonly tournaments: TournamentsService,
    private readonly events: EventsService,
  ) {}

  @Post()
  @UsePipes(new ZodValidationPipe(createTournamentInputSchema))
  create(
    @CurrentActor() actor: Actor,
    @Body() input: CreateTournamentInput,
  ): Promise<TournamentDetailDto> {
    return this.tournaments.create(actor, input);
  }

  @Get()
  list(@CurrentActor() actor: Actor): Promise<TournamentSummaryDto[]> {
    return this.tournaments.list(actor);
  }

  // Static segments before the parametric `:id` routes so they are not swallowed.

  @Post("import")
  @UsePipes(new ZodValidationPipe(importSetupInputSchema))
  import(
    @CurrentActor() actor: Actor,
    @Body() setup: TournamentSetup,
  ): Promise<TournamentDetailDto> {
    return this.tournaments.importSetup(actor, setup);
  }

  @Post("claim")
  claim(@CurrentActor() actor: Actor): Promise<{ claimed: number }> {
    // The anon token comes from the BFF-injected x-anon-token header (sourced
    // from the caller's own httpOnly cookie), never from client-supplied input —
    // otherwise any logged-in user could claim another guest's tournaments.
    if (!actor.userId) {
      throw new BadRequestException("A logged-in user is required to claim tournaments");
    }
    if (!actor.anonToken) {
      return Promise.resolve({ claimed: 0 });
    }
    return this.tournaments.claim(actor.userId, actor.anonToken);
  }

  @Get(":id")
  getById(
    @Param("id") id: string,
    @CurrentActor() actor: Actor,
    @Query("token") token?: string,
  ): Promise<TournamentDetailDto> {
    return this.tournaments.getById(id, actor, token);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @CurrentActor() actor: Actor): Promise<void> {
    return this.tournaments.remove(id, actor);
  }

  @Get(":id/export")
  export(@Param("id") id: string, @CurrentActor() actor: Actor): Promise<TournamentSetup> {
    return this.tournaments.exportSetup(id, actor);
  }

  @Post(":id/links")
  createLink(
    @Param("id") id: string,
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createCapabilityLinkInputSchema)) body: CreateCapabilityLinkInput,
  ): Promise<CapabilityLinkDto> {
    return this.tournaments.createLink(id, actor, body.type);
  }

  @Get(":id/links")
  listLinks(@Param("id") id: string, @CurrentActor() actor: Actor): Promise<CapabilityLinkDto[]> {
    return this.tournaments.listLinks(id, actor);
  }

  @Post(":id/matches/:matchId/score")
  score(
    @Param("id") id: string,
    @Param("matchId") matchId: string,
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(scoreInputSchema)) input: ScoreInput,
    @Query("token") token?: string,
  ): Promise<TournamentDetailDto> {
    return this.tournaments.score(actor, id, matchId, input, token);
  }

  @Patch(":id/design")
  updateDesign(
    @Param("id") id: string,
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(updateDesignInputSchema)) tokens: UpdateDesignInput,
  ): Promise<TournamentDetailDto> {
    return this.tournaments.updateDesign(actor, id, tokens);
  }

  @Sse(":id/events")
  streamEvents(
    @Param("id") id: string,
    @CurrentActor() actor: Actor,
    @Query("token") token?: string,
  ): Observable<{ data: MatchUpdateEvent }> {
    // Authorize first, then hand the connection over to this tournament's stream.
    return from(this.tournaments.assertCanView(id, actor, token)).pipe(
      switchMap(() => this.events.stream(id)),
    );
  }
}
