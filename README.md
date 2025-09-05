# Public AI Gateway Developer Portal

The developer portal and API gateway for the Public AI Inference Utility - a global compute platform that provides free and low-cost access to state-of-the-art AI models.

## About

The Public AI Inference Utility is a global compute platform that provides free and low-cost access to state-of-the-art AI models. Built on principles of openness, accessibility, and democratic governance, the Utility serves as critical infrastructure for the AI ecosystem.

Unlike commercial AI APIs that prioritize profit maximization, the Utility is designed to serve the public interest. We provide transparent pricing, open governance, and equitable access to ensure that AI capabilities are available to everyone, not just those who can afford premium services.

This repository contains the developer portal and API gateway that enables developers to:
- Create and manage API keys for accessing AI models
- View API documentation and usage examples
- Monitor API usage and billing
- Access developer resources and community contributions

## Main Platform

- **Chat Interface**: [chat.publicai.co](https://chat.publicai.co) - Interactive AI chat interface
- **Main Repository**: Contains community contributions, infrastructure charts, and platform governance

## Prerequisites

- A Zuplo account for deployment. You can [sign up for free](https://portal.zuplo.com/sign-up).
- Node.js and npm for local development

## Local Development

You can run this developer portal locally for development and testing:

```bash
# Install dependencies
npm install

# Start the API Gateway
npm run dev

# In a new terminal, start the Developer Portal
npm run docs
```

The API Gateway will be available at `https://localhost:9000` and the Developer Portal at `https://localhost:3000`.

## Deployment

Deploy to Zuplo using the CLI:

```bash
zuplo deploy
```

## Configuration

For deployment, you'll need to set up environment variables. Copy the example file:

```bash
cp env.example .env
```

Add the required environment variables:

- `ZP_DEVELOPER_API_KEY`: Account level API key for Zuplo API access
- `ZP_ACCOUNT_NAME`: Your Zuplo account name
- `ZP_API_KEY_SERVICE_BUCKET_NAME`: Bucket name for the API Key Service

## Features

### API Key Management
Developers can create and manage API keys through the portal:
1. Sign in to the developer portal
2. Navigate to API Keys section
3. Create new API keys with custom names and expiration times
4. Manage existing keys (view, rotate, delete)

### API Documentation
- Interactive API reference with built-in testing
- Code examples in multiple programming languages
- Authentication guides and best practices

### Usage Monitoring
- Real-time API usage statistics
- Rate limiting information
- Billing and cost tracking

## How to Contribute

We welcome contributions from the community! There are several ways you can help make AI more accessible:

### 🤝 Community Contributions
- Custom functions and tools for the platform
- Language and region-specific enhancements
- Documentation and examples

### ⚙️ Infrastructure Contributions
- API gateway improvements
- Performance optimizations
- Security enhancements

### 🚀 Platform Development
- User experience improvements
- New developer tools
- Integration enhancements

Get involved:
- Open an issue to discuss ideas
- Submit pull requests with improvements
- Join community discussions about platform direction

## Architecture

This developer portal is built using:
- **Zuplo**: API gateway and developer portal framework
- **Zudoku**: Documentation and portal UI
- **TypeScript**: Type-safe development
- **OpenAPI**: API specification and documentation

Key components:
- `modules/api-keys.ts` - API key management logic
- `config/api-key.oas.json` - OpenAPI specification
- `docs/zudoku.config.tsx` - Portal configuration

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Links

- **Main Chat App**: [chat.publicai.co](https://chat.publicai.co)
- **Platform Documentation**: Available in the main repository
- **Community**: Join our discussions for platform governance and development

---

*Building infrastructure that democratizes access to AI capabilities for everyone.*