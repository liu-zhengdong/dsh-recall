import { z } from "zod";
import type { DreamEngine } from "./engine.ts";
export declare const memoryInputSchema: z.ZodObject<{
    action: z.ZodEnum<{
        list: "list";
        read: "read";
        write: "write";
    }>;
    path: z.ZodDefault<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    expectedBefore: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sources: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export type MemoryInput = z.infer<typeof memoryInputSchema>;
export declare function runMemory(engine: DreamEngine, sessionId: string, input: MemoryInput, signal?: AbortSignal): Promise<unknown>;
