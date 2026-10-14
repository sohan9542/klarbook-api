import pino from "pino";
import { env } from "../config/env.js";

const isDev = env.NODE_ENV !== "production";


export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : isDev ? "debug" : "info",
   ...(isDev && { transport: { target: "pino-pretty" } }),
});