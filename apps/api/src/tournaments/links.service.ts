import { randomUUID } from "crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { CapabilityLink, CapabilityType } from "@prisma/client";
import { CapabilityLinkDto } from "@tournamentify/shared";
import { PrismaService } from "../prisma/prisma.service";
import { toCapabilityLink } from "./tournament.mapper";

const MS_PER_HOUR = 60 * 60 * 1000;

@Injectable()
export class LinksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tournamentId: string,
    type: CapabilityType,
    expiresInHours?: number,
  ): Promise<CapabilityLinkDto> {
    const expiresAt =
      expiresInHours !== undefined
        ? new Date(Date.now() + expiresInHours * MS_PER_HOUR)
        : null;
    const link = await this.prisma.capabilityLink.create({
      data: {
        tournamentId,
        type,
        token: randomUUID(),
        expiresAt,
      },
    });
    return toCapabilityLink(link);
  }

  /** Revoke (delete) a link, but only if it belongs to the given tournament. */
  async revoke(tournamentId: string, linkId: string): Promise<void> {
    const result = await this.prisma.capabilityLink.deleteMany({
      where: { id: linkId, tournamentId },
    });
    if (result.count === 0) {
      throw new NotFoundException("Link not found");
    }
  }

  async list(tournamentId: string): Promise<CapabilityLinkDto[]> {
    const links = await this.prisma.capabilityLink.findMany({
      where: { tournamentId },
      orderBy: { createdAt: "desc" },
    });
    return links.map(toCapabilityLink);
  }

  /** Returns the link only when it belongs to the tournament and is unexpired. */
  async resolve(tournamentId: string, token: string): Promise<CapabilityLink | null> {
    const link = await this.prisma.capabilityLink.findUnique({ where: { token } });
    if (!link || link.tournamentId !== tournamentId) {
      return null;
    }
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return link;
  }
}
