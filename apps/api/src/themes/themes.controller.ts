import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UnauthorizedException,
  UsePipes,
} from "@nestjs/common";
import {
  CreateSavedThemeInput,
  SavedThemeDto,
  createSavedThemeInputSchema,
} from "@tournamentify/shared";
import { Actor, CurrentActor } from "../common/current-actor.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ThemesService } from "./themes.service";

@Controller("themes")
export class ThemesController {
  constructor(private readonly themes: ThemesService) {}

  @Get()
  list(@CurrentActor() actor: Actor): Promise<SavedThemeDto[]> {
    return this.themes.list(requireUser(actor));
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createSavedThemeInputSchema))
  create(
    @CurrentActor() actor: Actor,
    @Body() input: CreateSavedThemeInput,
  ): Promise<SavedThemeDto> {
    return this.themes.create(requireUser(actor), input);
  }

  @Delete(":themeId")
  @HttpCode(204)
  remove(@CurrentActor() actor: Actor, @Param("themeId") themeId: string): Promise<void> {
    return this.themes.remove(requireUser(actor), themeId);
  }
}

/** Saved themes are tied to an account — guests (anon token only) get 401. */
function requireUser(actor: Actor): string {
  if (!actor.userId) {
    throw new UnauthorizedException("Saved themes require a logged-in account");
  }
  return actor.userId;
}
