/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activities from "../activities.js";
import type * as agents from "../agents.js";
import type * as documents from "../documents.js";
import type * as messages from "../messages.js";
import type * as models from "../models.js";
import type * as notifications from "../notifications.js";
import type * as projects from "../projects.js";
import type * as seed from "../seed.js";
import type * as seedTasks from "../seedTasks.js";
import type * as settings from "../settings.js";
import type * as taskSubscriptions from "../taskSubscriptions.js";
import type * as tasks from "../tasks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activities: typeof activities;
  agents: typeof agents;
  documents: typeof documents;
  messages: typeof messages;
  models: typeof models;
  notifications: typeof notifications;
  projects: typeof projects;
  seed: typeof seed;
  seedTasks: typeof seedTasks;
  settings: typeof settings;
  taskSubscriptions: typeof taskSubscriptions;
  tasks: typeof tasks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
