import 'reflect-metadata';
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import {
  Module,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';

import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { Server } from 'socket.io';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

import type { TelemetryEvent } from '../../../packages/shared/src';

/* =========================================================
   DATABASE
========================================================= */

const db = new Database(process.env.DB_PATH || 'sentinel.db');

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_ms INTEGER,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    name TEXT NOT NULL,
    status TEXT,
    duration_ms INTEGER,
    input_json TEXT,
    output_json TEXT,
    metadata_json TEXT,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0,
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_events_execution
    ON events(execution_id, sequence);

  CREATE INDEX IF NOT EXISTS idx_executions_started
    ON executions(started_at DESC);
`);

/* =========================================================
   APP SERVICE
========================================================= */

@Injectable()
class AppService implements OnModuleInit {

  onModuleInit() {
    // Database is already initialized above.
  }

  /* -------------------------------------------------------
     CREATE EXECUTION
  ------------------------------------------------------- */

  createExecution(body: any) {

    if (!body) {
      throw new Error('Execution body is required');
    }

    const id = body.id || randomUUID();

    const agentId = body.agentId || 'unknown-agent';
    const agentName = body.agentName || 'Unknown Agent';
    const prompt = body.prompt || '';
    const startedAt =
      body.startedAt || new Date().toISOString();

    db.prepare(`
      INSERT INTO executions (
        id,
        agent_id,
        agent_name,
        prompt,
        status,
        started_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      agentId,
      agentName,
      prompt,
      'running',
      startedAt
    );

    return this.getExecution(id);
  }

  /* -------------------------------------------------------
     ADD TELEMETRY EVENT
  ------------------------------------------------------- */

  addEvent(event: TelemetryEvent) {

    if (!event) {
      throw new Error('Telemetry event is required');
    }

    db.prepare(`
      INSERT OR REPLACE INTO events (
        id,
        execution_id,
        agent_id,
        type,
        timestamp,
        sequence,
        name,
        status,
        duration_ms,
        input_json,
        output_json,
        metadata_json,
        tokens_input,
        tokens_output,
        estimated_cost_usd,
        error
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      event.id,
      event.executionId,
      event.agentId,
      event.type,
      event.timestamp,
      event.sequence,
      event.name,
      event.status ?? null,
      event.durationMs ?? null,
      JSON.stringify(event.input ?? null),
      JSON.stringify(event.output ?? null),
      JSON.stringify(event.metadata ?? {}),
      event.tokensInput ?? 0,
      event.tokensOutput ?? 0,
      event.estimatedCostUsd ?? 0,
      event.error ?? null
    );

    /* -----------------------------------------------------
       UPDATE EXECUTION WHEN IT FINISHES
    ----------------------------------------------------- */

    if (
      event.type === 'execution.completed' ||
      event.type === 'error'
    ) {

      const execution = this.getExecution(
        event.executionId
      ) as any;

      if (execution) {

        const totals = db.prepare(`
          SELECT
            COALESCE(SUM(tokens_input), 0) AS inputTokens,
            COALESCE(SUM(tokens_output), 0) AS outputTokens,
            COALESCE(SUM(estimated_cost_usd), 0) AS cost
          FROM events
          WHERE execution_id = ?
        `).get(event.executionId) as any;

        db.prepare(`
          UPDATE executions
          SET
            status = ?,
            completed_at = ?,
            duration_ms = ?,
            input_tokens = ?,
            output_tokens = ?,
            estimated_cost_usd = ?,
            error = ?
          WHERE id = ?
        `).run(
          event.type === 'error'
            ? 'failed'
            : 'completed',

          event.timestamp,

          event.durationMs ??
            execution.duration_ms ??
            null,

          totals.inputTokens,
          totals.outputTokens,
          totals.cost,

          event.error ??
            execution.error ??
            null,

          event.executionId
        );
      }
    }

    return event;
  }

  /* -------------------------------------------------------
     GET ONE EXECUTION
  ------------------------------------------------------- */

  getExecution(id: string) {

    return db
      .prepare(`
        SELECT *
        FROM executions
        WHERE id = ?
      `)
      .get(id);
  }

  /* -------------------------------------------------------
     GET ALL EXECUTIONS
  ------------------------------------------------------- */

  listExecutions() {

    return db
      .prepare(`
        SELECT *
        FROM executions
        ORDER BY started_at DESC
        LIMIT 100
      `)
      .all();
  }

  /* -------------------------------------------------------
     GET EXECUTION EVENTS
  ------------------------------------------------------- */

  getEvents(id: string) {

    const events = db
      .prepare(`
        SELECT *
        FROM events
        WHERE execution_id = ?
        ORDER BY sequence ASC
      `)
      .all(id) as any[];

    return events.map((event: any) => ({
      ...event,

      input: JSON.parse(
        event.input_json || 'null'
      ),

      output: JSON.parse(
        event.output_json || 'null'
      ),

      metadata: JSON.parse(
        event.metadata_json || '{}'
      ),
    }));
  }

  /* -------------------------------------------------------
     STATISTICS
  ------------------------------------------------------- */

  stats() {

    return db
      .prepare(`
        SELECT
          COUNT(*) AS total,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'completed'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS completed,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'failed'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS failed,

          COALESCE(
            SUM(input_tokens + output_tokens),
            0
          ) AS tokens,

          COALESCE(
            SUM(estimated_cost_usd),
            0
          ) AS cost

        FROM executions
      `)
      .get();
  }
}

/* =========================================================
   WEBSOCKET GATEWAY
========================================================= */

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
class EventsGateway implements OnModuleInit {

  @WebSocketServer()
  server!: Server;

  /*
   * Store the Nest-created gateway instance.
   *
   * This allows AppController to broadcast events without
   * relying on constructor dependency injection.
   */
  private static instance: EventsGateway | null = null;

  onModuleInit() {
    EventsGateway.instance = this;
  }

  static broadcast(event: any) {

    const instance = EventsGateway.instance;

    if (
      instance &&
      instance.server
    ) {
      instance.server.emit(
        'telemetry',
        event
      );
    }
  }
}

/* =========================================================
   API CONTROLLER
========================================================= */

@Controller()
class AppController {

  /*
   * Explicitly create the service.
   *
   * This avoids the dependency-injection problem that was
   * causing `this.app` to become undefined.
   */
  private readonly app = new AppService();

  /* -------------------------------------------------------
     HEALTH
  ------------------------------------------------------- */

  @Get('health')
  health() {

    return {
      ok: true,
      service: 'sentinel-api',
      time: new Date().toISOString(),
    };
  }

  /* -------------------------------------------------------
     GET EXECUTIONS
  ------------------------------------------------------- */

  @Get('api/executions')
  executions() {

    return this.app.listExecutions();
  }

  /* -------------------------------------------------------
     GET SINGLE EXECUTION + EVENTS
  ------------------------------------------------------- */

  @Get('api/executions/:id')
  execution(
    @Param('id') id: string
  ) {

    const execution =
      this.app.getExecution(id);

    if (!execution) {

      return {
        error: 'Execution not found',
      };
    }

    return {
      ...execution as any,
      events: this.app.getEvents(id),
    };
  }

  /* -------------------------------------------------------
     STATISTICS
  ------------------------------------------------------- */

  @Get('api/stats')
  stats() {

    return this.app.stats();
  }

  /* -------------------------------------------------------
     TELEMETRY: CREATE EXECUTION
  ------------------------------------------------------- */

  @Post('api/telemetry/executions')
  create(
    @Body() body: any
  ) {

    const result =
      this.app.createExecution(body);

    EventsGateway.broadcast({
      kind: 'execution.created',
      execution: result,
    });

    return result;
  }

  /* -------------------------------------------------------
     TELEMETRY: ADD EVENT
  ------------------------------------------------------- */

  @Post('api/telemetry/events')
  event(
    @Body() event: TelemetryEvent
  ) {

    const result =
      this.app.addEvent(event);

    EventsGateway.broadcast({
      kind: 'telemetry',
      event: result,
    });

    return result;
  }
}

/* =========================================================
   NESTJS MODULE
========================================================= */

@Module({
  controllers: [
    AppController,
  ],

  providers: [
    AppService,
    EventsGateway,
  ],
})
class AppModule {}

/* =========================================================
   BOOTSTRAP
========================================================= */

async function bootstrap() {

  const app =
    await NestFactory.create(
      AppModule
    );

  app.enableCors();

  const port =
    Number(
      process.env.API_PORT || 3001
    );

  await app.listen(port);

  console.log(
    `Sentinel API: http://localhost:${port}`
  );
}

bootstrap();