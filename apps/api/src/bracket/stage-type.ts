import { StageType as PrismaStageType } from "@prisma/client";
import { StageType } from "@tournamentify/shared";

/**
 * Bridges the two enum dialects: the shared/domain layer uses lower_snake
 * (zod enum), while Prisma generates UPPER_SNAKE constants. Both switches are
 * exhaustive so adding a new format breaks the build until it is mapped here.
 */

export function toPrismaStageType(s: StageType): PrismaStageType {
  switch (s) {
    case "single_elimination":
      return PrismaStageType.SINGLE_ELIMINATION;
    case "double_elimination":
      return PrismaStageType.DOUBLE_ELIMINATION;
    case "round_robin":
      return PrismaStageType.ROUND_ROBIN;
    case "swiss":
      return PrismaStageType.SWISS;
    default: {
      const _exhaustive: never = s;
      return _exhaustive;
    }
  }
}

export function toDomainStageType(p: PrismaStageType): StageType {
  switch (p) {
    case PrismaStageType.SINGLE_ELIMINATION:
      return "single_elimination";
    case PrismaStageType.DOUBLE_ELIMINATION:
      return "double_elimination";
    case PrismaStageType.ROUND_ROBIN:
      return "round_robin";
    case PrismaStageType.SWISS:
      return "swiss";
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}
