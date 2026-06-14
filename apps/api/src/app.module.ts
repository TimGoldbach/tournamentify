import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma/prisma.service";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
      },
    }),
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
