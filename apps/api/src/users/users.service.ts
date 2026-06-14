import { Injectable, NotFoundException } from "@nestjs/common";
import { UserDto, UserSyncInput } from "@tournamentify/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async sync(input: UserSyncInput): Promise<UserDto> {
    const authProviderId = `${input.provider}:${input.providerId}`;

    const byProvider = await this.prisma.user.findUnique({ where: { authProviderId } });
    if (byProvider) {
      return this.toDto(byProvider);
    }

    const byEmail = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (byEmail) {
      const updated = await this.prisma.user.update({
        where: { id: byEmail.id },
        data: { authProviderId },
      });
      return this.toDto(updated);
    }

    const created = await this.prisma.user.create({
      data: { email: input.email, authProviderId, tier: "FREE" },
    });
    return this.toDto(created);
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return this.toDto(user);
  }

  private toDto(user: { id: string; email: string; tier: UserDto["tier"] }): UserDto {
    return { id: user.id, email: user.email, tier: user.tier };
  }
}
