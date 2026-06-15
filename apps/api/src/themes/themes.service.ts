import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SavedTheme } from "@prisma/client";
import { CreateSavedThemeInput, SavedThemeDto, designTokensSchema } from "@tournamentify/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Saved themes are an account feature: every operation is scoped to a single
 * owning user. Stored tokens are validated through the shared schema on the way
 * out so a malformed row never leaks an unexpected shape to the client.
 */
@Injectable()
export class ThemesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<SavedThemeDto[]> {
    const themes = await this.prisma.savedTheme.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: "desc" },
    });
    return themes.map(toSavedTheme);
  }

  async create(userId: string, input: CreateSavedThemeInput): Promise<SavedThemeDto> {
    const theme = await this.prisma.savedTheme.create({
      data: {
        ownerUserId: userId,
        name: input.name,
        tokens: input.tokens as Prisma.InputJsonValue,
      },
    });
    return toSavedTheme(theme);
  }

  async remove(userId: string, themeId: string): Promise<void> {
    // deleteMany scoped to the owner so another user's theme is never touched;
    // a zero count means it either does not exist or is not ours -> 404.
    const result = await this.prisma.savedTheme.deleteMany({
      where: { id: themeId, ownerUserId: userId },
    });
    if (result.count === 0) {
      throw new NotFoundException("Theme not found");
    }
  }
}

function toSavedTheme(theme: SavedTheme): SavedThemeDto {
  const parsed = designTokensSchema.safeParse(theme.tokens);
  return {
    id: theme.id,
    name: theme.name,
    tokens: parsed.success ? parsed.data : {},
    createdAt: theme.createdAt.toISOString(),
  };
}
