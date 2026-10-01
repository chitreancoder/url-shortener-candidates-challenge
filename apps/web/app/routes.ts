import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("stats", "routes/stats.tsx"),
  route("not-found", "routes/not-found.tsx"),
] satisfies RouteConfig;
