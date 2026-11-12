import 'reflect-metadata';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({
  path: path.resolve(process.cwd(), '../../.env'),
});

import OpenAI from 'openai';
import { NestFactory } from '@nestjs/core';
import { Module, Controller, Post, Body, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { TelemetryEvent } from '../../../packages/shared/src';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const API_URL = process.env.SENTINEL_API_URL || 'http://localhost:3001';
const MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
const INPUT_RATE = 0.10 / 1_000_000;
const OUTPUT_RATE = 0.50 / 1_000_000;

const tools = [
  {
    type: 'function' as const,
    name: 'search_knowledge',
    description: 'Search Sentinel local knowledge for information about the Sentinel project. Use this when the user asks about Sentinel architecture, roles, telemetry, or project features.',
    strict: true,
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'get_current_time',
    description: 'Get the current server time when the user explicitly asks for current time.',
    strict: true,
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
];

const knowledge = [
  {title:'Sentinel architecture',text:'Sentinel observes AI-agent workflows. The planned flow is AI Agent → telemetry/automation layer → NestJS backend → database → API/WebSocket → React dashboard.'},
  {title:'Member 1',text:'Member 1 owns agent execution, automation and telemetry. They capture model calls, tool calls, timing, tokens, errors, context and memory changes.'},
  {title:'Member 2',text:'Member 2 owns the NestJS backend and database. They receive telemetry, persist executions/events and expose APIs and live events.'},
  {title:'Member 3',text:'Member 3 owns the React frontend. It visualizes executions, workflow steps, tool/model activity, errors, timing, tokens and cost.'},
  {title:'Telemetry',text:'Telemetry is structured information describing what an agent did: execution start/end, model calls, tool calls, inputs/outputs, errors, durations and usage metrics.'},
];

async function send(path:string, body:any) { const r=await fetch(`${API_URL}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); if(!r.ok) throw new Error(`Telemetry API ${r.status}`); return r.json(); }
async function emit(event:TelemetryEvent){ try { await send('/api/telemetry/events',event); } catch(e){ console.error('Telemetry delivery failed',e); } }
function cost(input:number, output:number){ return input*INPUT_RATE + output*OUTPUT_RATE; }
function usageOf(response:any){ return {input:Number(response.usage?.input_tokens||0),output:Number(response.usage?.output_tokens||0)}; }

@Injectable()
class AgentService {
  async run(prompt:string){
    if(!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
    const executionId=randomUUID(); const agentId='sentinel-agent'; const start=Date.now(); let seq=0;
    await send('/api/telemetry/executions',{id:executionId,agentId,agentName:'Sentinel Autonomous Agent',prompt,startedAt:new Date(start).toISOString()});
    await emit({id:randomUUID(),executionId,agentId,type:'execution.started',timestamp:new Date(start).toISOString(),sequence:seq++,name:'Agent execution started',metadata:{model:MODEL}});
    try {
      await emit({id:randomUUID(),executionId,agentId,type:'llm.started',timestamp:new Date().toISOString(),sequence:seq++,name:`OpenAI ${MODEL}`,status:'running',metadata:{model:MODEL,round:0}});
      let response=await client.responses.create({model:MODEL,instructions:'You are the Sentinel demo autonomous agent. Answer the user accurately and concisely. Use the available tools when appropriate. Never claim that a tool was used if you did not use it.',input:prompt,tools});
      let totalIn=0,totalOut=0;
      for(let round=0; round<5; round++){
        const u=usageOf(response); totalIn+=u.input; totalOut+=u.output;
        const calls=(response.output||[]).filter((x:any)=>x.type==='function_call');
        const llmCost=cost(u.input,u.output);
        await emit({id:randomUUID(),executionId,agentId,type:'llm.completed',timestamp:new Date().toISOString(),sequence:seq++,name:`OpenAI ${MODEL}`,status:'completed',durationMs:0,output:response.output_text,tokensInput:u.input,tokensOutput:u.output,estimatedCostUsd:llmCost,metadata:{model:MODEL,responseId:response.id,round}});
        if(!calls.length) break;
        const outputs:any[]=[];
        for(const call of calls){
          const toolStart=Date.now(); let result:any;
          await emit({id:randomUUID(),executionId,agentId,type:'tool.started',timestamp:new Date(toolStart).toISOString(),sequence:seq++,name:call.name,status:'running',input:JSON.parse(call.arguments||'{}')});
          if(call.name==='search_knowledge'){
            const q=String(JSON.parse(call.arguments||'{}').query).toLowerCase();
            const terms=q.split(/\s+/).filter((w:string)=>w.length>3);
            result=knowledge.filter(k=>terms.some((t:string)=>(k.title+' '+k.text).toLowerCase().includes(t))).slice(0,3);
            if(!result.length) result=knowledge.slice(0,2);
          } else if(call.name==='get_current_time') result={iso:new Date().toISOString(),local:new Date().toString()};
          else result={error:'Unknown tool'};
          const duration=Date.now()-toolStart;
          await emit({id:randomUUID(),executionId,agentId,type:'tool.completed',timestamp:new Date().toISOString(),sequence:seq++,name:call.name,status:'completed',durationMs:duration,input:JSON.parse(call.arguments||'{}'),output:result});
          outputs.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result)});
        }
        const nextStart=Date.now();
        await emit({id:randomUUID(),executionId,agentId,type:'llm.started',timestamp:new Date(nextStart).toISOString(),sequence:seq++,name:`OpenAI ${MODEL}`,status:'running',metadata:{model:MODEL,round:round+1}});
        response=await client.responses.create({model:MODEL,instructions:'You are the Sentinel demo autonomous agent. Answer the user accurately and concisely. Use tool results as evidence. Do not expose internal telemetry.',previous_response_id:response.id,input:outputs,tools});
      }
      await emit({id:randomUUID(),executionId,agentId,type:'execution.completed',timestamp:new Date().toISOString(),sequence:seq++,name:'Agent execution completed',status:'completed',durationMs:Date.now()-start,tokensInput:totalIn,tokensOutput:totalOut,estimatedCostUsd:cost(totalIn,totalOut),output:response.output_text});
      return {executionId,output:response.output_text,model:MODEL,inputTokens:totalIn,outputTokens:totalOut,estimatedCostUsd:cost(totalIn,totalOut)};
    } catch(error:any){
      await emit({id:randomUUID(),executionId,agentId,type:'error',timestamp:new Date().toISOString(),sequence:seq++,name:'Agent execution failed',status:'failed',durationMs:Date.now()-start,error:error?.message||String(error)});
      throw error;
    }
  }
}

// Keep the HTTP surface intentionally tiny: Sentinel sends the actual user prompt here.
@Controller()
@Controller()
class RunController {
  private readonly agent = new AgentService();

  @Post('run')
  run(@Body() body: { prompt: string }) {
    if (!body?.prompt?.trim()) {
      throw new Error('prompt is required');
    }

    return this.agent.run(body.prompt.trim());
  }

  @Post('health')
  health() {
    return {
      ok: true,
      service: 'sentinel-agent',
      model: MODEL
    };
  }
}
@Module({controllers:[RunController],providers:[AgentService]}) class AppModule{}
async function bootstrap(){const app=await NestFactory.create(AppModule);app.enableCors();await app.listen(Number(process.env.AGENT_PORT||3002));console.log(`Sentinel Agent: http://localhost:${process.env.AGENT_PORT||3002}`)}
bootstrap();
