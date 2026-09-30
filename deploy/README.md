# Deployment

GitHub is your repository/source-control layer. It is not the server itself.

## Local (recommended first)
Run MediaX directly on the laptop:
`npm start`

The API is on `http://127.0.0.1:5500`.

## Public API later
Deploy the same Node project to a Node-compatible service. Set:
- `API_HOST=0.0.0.0`
- `API_PORT` from the host
- `PUBLIC_BASE_URL=https://your-domain.example`
- secrets in the host's environment settings

Do not commit `.env`.

For Discord-only usage, you do not need a public API URL: the bot and API can run on the same laptop.
