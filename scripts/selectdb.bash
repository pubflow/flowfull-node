#!/bin/bash
# install-bridge-payments.sh

echo "Installing Bridge-Payments dependencies..."

# Core dependencies (REQUIRED)
bun add hono kysely zod nanoid

# Choose your database (CHOOSE ONE)
echo "Choose your database:"
echo "1) PostgreSQL"
echo "2) Neon"
echo "3) MySQL" 
echo "4) PlanetScale"
echo "5) LibSQL/Turso"
echo "6) SQLite (dev only)"

read -p "Enter choice (1-6): " db_choice

case $db_choice in
  1) bun add pg @types/pg ;;
  2) bun add kysely-neon @neondatabase/serverless ws ;;
  3) bun add mysql2 ;;
  4) bun add kysely-planetscale @planetscale/database undici ;;
  5) bun add @libsql/kysely-libsql @libsql/client ;;
  6) bun add better-sqlite3 ;;
esac

# Payment providers (CHOOSE AT LEAST ONE)
echo "Choose payment providers:"
read -p "Install Stripe? (y/n): " stripe
read -p "Install PayPal? (y/n): " paypal
read -p "Install Authorize.net? (y/n): " authnet

[[ $stripe == "y" ]] && bun add stripe
[[ $paypal == "y" ]] && bun add @paypal/sdk-client
[[ $authnet == "y" ]] && bun add authorizenet

# Development dependencies (REQUIRED)
bun add -d @types/bun typescript

# Optional dependencies
read -p "Install monitoring & logging? (y/n): " monitoring
[[ $monitoring == "y" ]] && bun add winston prom-client

read -p "Install testing framework? (y/n): " testing
[[ $testing == "y" ]] && bun add -d jest @types/jest supertest @types/supertest

echo "Installation complete!"