import { Module } from "@nestjs/common";
import { BracketGenerator } from "../bracket/bracket-generator.service";
import { LinksService } from "./links.service";
import { TournamentsController } from "./tournaments.controller";
import { TournamentsService } from "./tournaments.service";

@Module({
  controllers: [TournamentsController],
  providers: [TournamentsService, LinksService, BracketGenerator],
})
export class TournamentsModule {}

