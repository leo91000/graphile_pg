# PostgreSQL test database configuration
export DATABASE_URL := "postgres://test:test@localhost:54321/test"
export CONTAINER_NAME := "pg-adapter-test"

# Run tests with PostgreSQL container
test:
    @echo "Cleaning up existing container..."
    @docker stop {{CONTAINER_NAME}} 2>/dev/null || true
    @docker rm {{CONTAINER_NAME}} 2>/dev/null || true
    @echo "Starting PostgreSQL container..."
    docker run -d \
        --name {{CONTAINER_NAME}} \
        -e POSTGRES_USER=test \
        -e POSTGRES_PASSWORD=test \
        -e POSTGRES_DB=test \
        -p 54321:5432 \
        postgres:16-alpine
    @echo "Waiting for PostgreSQL to be ready..."
    @until docker exec {{CONTAINER_NAME}} pg_isready -U test; do \
        echo "Waiting for database..."; \
        sleep 1; \
    done
    @echo "Running tests..."
    DATABASE_URL={{DATABASE_URL}} yarn test
    @echo "Stopping PostgreSQL container..."
    docker stop {{CONTAINER_NAME}} || true
    docker rm {{CONTAINER_NAME}} || true