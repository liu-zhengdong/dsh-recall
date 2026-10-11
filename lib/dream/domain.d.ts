import { z } from "zod";
export declare const DREAM_BATCH_SIZE = 30;
export declare const DREAM_MIN_INTERVAL_MS: number;
export declare const DREAM_TIMEOUT_MS: number;
export declare const DREAM_FILE_BYTES: number;
export declare const DREAM_MAX_CHANGES = 20;
declare const batchRunSchema: z.ZodObject<{
    id: z.ZodString;
    ordinal: z.ZodNumber;
    sessionId: z.ZodString;
    turn: z.ZodNumber;
    startedAt: z.ZodString;
    endedAt: z.ZodString;
    status: z.ZodEnum<{
        completed: "completed";
        failed: "failed";
        interrupted: "interrupted";
    }>;
    goal: z.ZodString;
    overview: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type DreamBatchRun = z.infer<typeof batchRunSchema>;
export declare const dreamConclusionSchema: z.ZodObject<{
    text: z.ZodString;
    kind: z.ZodEnum<{
        fact: "fact";
        inference: "inference";
        unverified: "unverified";
    }>;
    sources: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export declare const dreamSubmissionSchema: z.ZodObject<{
    conclusions: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        kind: z.ZodEnum<{
            fact: "fact";
            inference: "inference";
            unverified: "unverified";
        }>;
        sources: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    noChangeReason: z.ZodDefault<z.ZodString>;
}, z.core.$strict>;
export type DreamSubmission = z.infer<typeof dreamSubmissionSchema>;
export type DreamConclusion = z.infer<typeof dreamConclusionSchema>;
declare const changeSchema: z.ZodObject<{
    path: z.ZodString;
    before: z.ZodNullable<z.ZodString>;
    after: z.ZodNullable<z.ZodString>;
    sources: z.ZodArray<z.ZodString>;
    at: z.ZodString;
    verified: z.ZodBoolean;
    error: z.ZodString;
}, z.core.$strip>;
export type DreamChange = z.infer<typeof changeSchema>;
export declare const dreamJobSchema: z.ZodObject<{
    id: z.ZodString;
    sessionId: z.ZodString;
    cwd: z.ZodString;
    title: z.ZodString;
    status: z.ZodEnum<{
        running: "running";
        completed: "completed";
        failed: "failed";
        interrupted: "interrupted";
        starting: "starting";
        cancelled: "cancelled";
    }>;
    startedAt: z.ZodString;
    endedAt: z.ZodNullable<z.ZodString>;
    error: z.ZodString;
    batch: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        ordinal: z.ZodNumber;
        sessionId: z.ZodString;
        turn: z.ZodNumber;
        startedAt: z.ZodString;
        endedAt: z.ZodString;
        status: z.ZodEnum<{
            completed: "completed";
            failed: "failed";
            interrupted: "interrupted";
        }>;
        goal: z.ZodString;
        overview: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    retryOf: z.ZodNullable<z.ZodString>;
    memoryDirectory: z.ZodString;
    conclusions: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        kind: z.ZodEnum<{
            fact: "fact";
            inference: "inference";
            unverified: "unverified";
        }>;
        sources: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    noChangeReason: z.ZodString;
    submittedAt: z.ZodNullable<z.ZodString>;
    submittedTurn: z.ZodNullable<z.ZodNumber>;
    changes: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        before: z.ZodNullable<z.ZodString>;
        after: z.ZodNullable<z.ZodString>;
        sources: z.ZodArray<z.ZodString>;
        at: z.ZodString;
        verified: z.ZodBoolean;
        error: z.ZodString;
    }, z.core.$strip>>;
    draft: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        submission: z.ZodObject<{
            conclusions: z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                kind: z.ZodEnum<{
                    fact: "fact";
                    inference: "inference";
                    unverified: "unverified";
                }>;
                sources: z.ZodArray<z.ZodString>;
            }, z.core.$strict>>;
            noChangeReason: z.ZodDefault<z.ZodString>;
        }, z.core.$strict>;
        turn: z.ZodNumber;
        at: z.ZodString;
    }, z.core.$strip>>>;
    correctionError: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export type DreamJob = z.infer<typeof dreamJobSchema>;
declare const cursorSchema: z.ZodObject<{
    cwd: z.ZodString;
    cursor: z.ZodNumber;
}, z.core.$strip>;
export type DreamCursor = z.infer<typeof cursorSchema>;
declare const controlSchema: z.ZodObject<{
    paused: z.ZodBoolean;
    lastAttempt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type DreamControl = z.infer<typeof controlSchema>;
declare const sessionSchema: z.ZodObject<{
    sessionId: z.ZodString;
    rootSessionId: z.ZodString;
}, z.core.$strip>;
export type DreamSession = z.infer<typeof sessionSchema>;
/** 独立域，不触碰已有 run_archive v1。 */
export declare const dreamDomain: {
    name: string;
    version: number;
    layout: "per-record";
    tables: {
        jobs: {
            valueSchema: z.ZodObject<{
                id: z.ZodString;
                sessionId: z.ZodString;
                cwd: z.ZodString;
                title: z.ZodString;
                status: z.ZodEnum<{
                    running: "running";
                    completed: "completed";
                    failed: "failed";
                    interrupted: "interrupted";
                    starting: "starting";
                    cancelled: "cancelled";
                }>;
                startedAt: z.ZodString;
                endedAt: z.ZodNullable<z.ZodString>;
                error: z.ZodString;
                batch: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    ordinal: z.ZodNumber;
                    sessionId: z.ZodString;
                    turn: z.ZodNumber;
                    startedAt: z.ZodString;
                    endedAt: z.ZodString;
                    status: z.ZodEnum<{
                        completed: "completed";
                        failed: "failed";
                        interrupted: "interrupted";
                    }>;
                    goal: z.ZodString;
                    overview: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
                retryOf: z.ZodNullable<z.ZodString>;
                memoryDirectory: z.ZodString;
                conclusions: z.ZodArray<z.ZodObject<{
                    text: z.ZodString;
                    kind: z.ZodEnum<{
                        fact: "fact";
                        inference: "inference";
                        unverified: "unverified";
                    }>;
                    sources: z.ZodArray<z.ZodString>;
                }, z.core.$strict>>;
                noChangeReason: z.ZodString;
                submittedAt: z.ZodNullable<z.ZodString>;
                submittedTurn: z.ZodNullable<z.ZodNumber>;
                changes: z.ZodArray<z.ZodObject<{
                    path: z.ZodString;
                    before: z.ZodNullable<z.ZodString>;
                    after: z.ZodNullable<z.ZodString>;
                    sources: z.ZodArray<z.ZodString>;
                    at: z.ZodString;
                    verified: z.ZodBoolean;
                    error: z.ZodString;
                }, z.core.$strip>>;
                draft: z.ZodDefault<z.ZodNullable<z.ZodObject<{
                    submission: z.ZodObject<{
                        conclusions: z.ZodArray<z.ZodObject<{
                            text: z.ZodString;
                            kind: z.ZodEnum<{
                                fact: "fact";
                                inference: "inference";
                                unverified: "unverified";
                            }>;
                            sources: z.ZodArray<z.ZodString>;
                        }, z.core.$strict>>;
                        noChangeReason: z.ZodDefault<z.ZodString>;
                    }, z.core.$strict>;
                    turn: z.ZodNumber;
                    at: z.ZodString;
                }, z.core.$strip>>>;
                correctionError: z.ZodDefault<z.ZodString>;
            }, z.core.$strip>;
        };
        cursors: {
            valueSchema: z.ZodObject<{
                cwd: z.ZodString;
                cursor: z.ZodNumber;
            }, z.core.$strip>;
        };
        control: {
            valueSchema: z.ZodObject<{
                paused: z.ZodBoolean;
                lastAttempt: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
        };
        sessions: {
            valueSchema: z.ZodObject<{
                sessionId: z.ZodString;
                rootSessionId: z.ZodString;
            }, z.core.$strip>;
        };
    };
};
export {};
