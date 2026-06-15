import { Module } from "@nestjs/common";
import { BracketGenerator } from "../bracket/bracket-generator.service";
import { EventsService } from "./events.service";
import { LinksService } from "./links.service";
import { TournamentsController } from "./tournaments.controller";
import { TournamentsService } from "./tournaments.service";

@Module({
  controllers: [TournamentsController],
  providers: [TournamentsService, LinksService, BracketGenerator, EventsService],
  exports: [EventsService],
})
export class TournamentsModule {}

