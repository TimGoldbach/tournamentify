import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { ServiceTokenGuard } from "./common/service-token.guard";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { TournamentsModule } from "./tournaments/tournaments.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
        // Never log the BFF shared secret, the forwarded actor headers, or cookies.
        redact: {
          paths: [
            'req.headers["x-bff-service-token"]',
            'req.headers["x-user-id"]',
            'req.headers["x-anon-token"]',
            "req.headers.authorization",
            "req.headers.cookie",
          ],
          censor: "[redacted]",
        },
      },
    }),
    PrismaModule,
    UsersModule,
    TournamentsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ServiceTokenGuard,
    },
  ],
})
export class AppModule {}
