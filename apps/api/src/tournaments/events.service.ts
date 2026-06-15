import { Injectable } from "@nestjs/common";
import { MatchUpdateEvent } from "@tournamentify/shared";
import { Observable, Subject } from "rxjs";

/**
 * Process-local SSE fan-out. One rxjs Subject per tournament id multiplexes
 * change signals to every connected client of that tournament. The payload is a
 * deliberately thin "something changed" event — clients refetch the detail on
 * receipt rather than trusting an incremental diff over the wire.
 *
 * NOTE: subjects live in this single instance's memory. That is fine for our
 * single-process VPS deployment, but it does NOT fan out across replicas — a
 * scorer on instance A would not notify a viewer pinned to instance B. Moving to
 * multiple instances would require a shared broker (Redis pub/sub, Postgres
 * LISTEN/NOTIFY, …) behind this same interface.
 */
@Injectable()
export class EventsService {
  private readonly subjects = new Map<string, Subject<{ data: MatchUpdateEvent }>>();

  /** Subscribe to change signals for a tournament, lazily creating its subject. */
  stream(tournamentId: string): Observable<{ data: MatchUpdateEvent }> {
    return this.subjectFor(tournamentId).asObservable();
  }

  /** Push a change signal to every current subscriber of this tournament. */
  emit(tournamentId: string): void {
    this.subjectFor(tournamentId).next({ data: { tournamentId } });
  }

  private subjectFor(tournamentId: string): Subject<{ data: MatchUpdateEvent }> {
    let subject = this.subjects.get(tournamentId);
    if (!subject) {
      subject = new Subject<{ data: MatchUpdateEvent }>();
      this.subjects.set(tournamentId, subject);
    }
    return subject;
  }
}
