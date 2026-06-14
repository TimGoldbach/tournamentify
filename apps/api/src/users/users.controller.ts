import { Body, Controller, Get, Post, UnauthorizedException } from "@nestjs/common";
import { UserSyncInput, userSyncInputSchema } from "@tournamentify/shared";
import { Actor, CurrentActor } from "../common/current-actor.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post("sync")
  sync(@Body(new ZodValidationPipe(userSyncInputSchema)) body: UserSyncInput) {
    return this.usersService.sync(body);
  }

  @Get("me")
  me(@CurrentActor() actor: Actor) {
    if (!actor.userId) {
      throw new UnauthorizedException();
    }
    return this.usersService.me(actor.userId);
  }
}
