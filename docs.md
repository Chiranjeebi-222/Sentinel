# Sentinel actual execution contract

## The prompt the user gives

There is no hidden fixed user prompt. The prompt is entered in the **Send a task to Sentinel** box in the React dashboard.

Example prompts:

1. `Explain how Sentinel works. Use the project knowledge tool if useful.`
2. `What is the role of Member 2 in Sentinel?`
3. `What is telemetry and why is it useful for AI agents?`
4. `What time is it right now?`
5. `Describe the Sentinel data flow from an agent request to the dashboard.`

## What actually happens

1. React sends the user's prompt to `POST http://localhost:3002/run`.
2. The Agent Service creates an execution ID.
3. The Agent Service records `execution.started` through the API.
4. The Agent Service calls the OpenAI Responses API with the selected model.
5. The model may request `search_knowledge` or `get_current_time`.
6. Every tool request/result and LLM request/result is emitted as telemetry.
7. Telemetry is POSTed to the NestJS API.
8. NestJS stores executions/events in SQLite and broadcasts new events through Socket.IO.
9. React listens to Socket.IO and refreshes the current dashboard data.
10. The selected execution is rendered as a workflow and event timeline.

## What the dashboard numbers mean

- Tokens = the `input_tokens` + `output_tokens` reported by the OpenAI response usage object.
- Estimated cost = input tokens × input price + output tokens × output price for the configured model.
- Duration = measured wall-clock duration of the agent execution.
- Status = execution state recorded by Sentinel, not an invented frontend value.

The exact OpenAI prices should be treated as configuration/data that may change. Check the current official pricing page before presenting cost numbers as financial/accounting data.
