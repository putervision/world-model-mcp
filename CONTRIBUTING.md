# Contributing to @putervision/world-model-mcp

Thank you for your interest in contributing to `@putervision/world-model-mcp`!

## Requirements
- Node.js >= 18.18.0
- npm >= 9.0.0

## Development Workflow

```bash
# Install dependencies
npm install

# Run build in watch mode
npm run dev

# Run unit and integration tests with coverage
npm run test:coverage

# Run code formatting check
npm run format:check

# Run linter
npm run lint

# Run full CI pipeline
npm run ci
```

## Architectural Guidelines

1. **Deterministic State Mutations**: All database modifications must occur within SQLite transactions.
2. **Event Sourcing & Cryptographic Chaining**: Every entity mutation must record an event in `entity_history` with canonical SHA-256 hash chaining.
3. **Path Traversal Defenses**: Always validate external file paths with `validatePath()`.
4. **NASA Power of Ten Rules**: Bounded loops, cycle detection on topological graph traversals, and non-null math assertions.
5. **Zero-Dependency Core Math**: 3D spatial calculations (frustum projection, AABB collision, raycasting) must rely on built-in vector algorithms without heavy native C++ spatial libraries.

## Pull Request Checklist
- Add unit tests for all new engine capabilities and tool endpoints.
- Ensure test coverage remains $\ge 90\%$.
- Verify that `npm run ci` passes cleanly with 0 errors.
