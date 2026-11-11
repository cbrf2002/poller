// Bundler stand-in for optional NestJS packages this app never loads
// (websockets, microservices, class-validator, class-transformer). Nest
// probes for them with optional imports and skips them when they export nothing.
export {};
