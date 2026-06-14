import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { CapabilityLink, CapabilityType } from "@prisma/client";
import { CapabilityLinkDto } from "@tournamentify/shared";
import { PrismaService } from "../prisma/prisma.service";
import { toCapabilityLink } from "./tournament.mapper";

@Injectable()
export class LinksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tournamentId: string, type: CapabilityType): Promise<CapabilityLinkDto> {
    const link = await this.prisma.capabilityLink.create({
      data: {
        tournamentId,
        type,
        token: randomUUID(),
      },
    });
    return toCapabilityLink(link);
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
