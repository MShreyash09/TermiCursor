# Backend Engineering Guidelines

When writing backend code (Python, FastAPI, Node.js, etc.), adhere to these industry-standard practices:
1. **Architecture**: Separate your concerns. Keep routes/controllers distinct from business logic and database access layers.
2. **Types**: Use type hints (e.g., Python's `typing` module, Pydantic models) to ensure robustness and self-documenting code.
3. **Error Handling**: Do not silently catch exceptions. Use proper HTTP status codes (400, 404, 500) and return informative error messages to the client.
4. **Security**: Never hardcode secrets. Always use environment variables. Prevent SQL injection by using ORMs or parameterized queries.
5. **Performance**: Avoid blocking the main thread (especially in async frameworks like FastAPI or Node). Use `async`/`await` for I/O bound operations.
6. **Logging**: Log critical errors, warnings, and trace contexts for observability.
