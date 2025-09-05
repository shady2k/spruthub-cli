# Spruthub CLI

A command-line interface tool for managing Spruthub smart home devices. Built with TypeScript and ES modules, providing complete access to all Spruthub API methods through dynamic command generation.

## Features

- **Dynamic Command Generation**: All API methods from spruthub-client are automatically available as CLI commands
- **Multiple Output Formats**: JSON, YAML, and formatted tables
- **Secure Credential Management**: Encrypted credential storage using keytar
- **Profile Management**: Support for multiple device profiles
- **Script Management**: Push/pull scenarios to/from devices
- **TypeScript**: Full type safety and modern ES modules
- **Method Discovery**: Built-in API exploration and documentation

## Installation

```bash
npm install -g spruthub-cli
```

## Quick Start

1. **Login to your Spruthub device**:
   ```bash
   spruthub-cli login
   ```

2. **Check connection status**:
   ```bash
   spruthub-cli status
   ```

3. **Discover available commands**:
   ```bash
   spruthub-cli methods list
   ```

4. **List your devices**:
   ```bash
   spruthub-cli accessory list
   ```

## Commands

### Core Commands

- `spruthub-cli login` - Setup authentication with Spruthub device
- `spruthub-cli logout` - Remove saved credentials  
- `spruthub-cli status` - Check connection status and profile info
- `spruthub-cli use <profile>` - Switch between profiles
- `spruthub-cli push <source>` - Upload scenarios/scripts to device
- `spruthub-cli pull [destination]` - Download scenarios from device

### Dynamic API Commands

All spruthub-client API methods are available as commands, organized by category:

#### Hub Management
- `spruthub-cli hub list` - List all hubs
- `spruthub-cli hub clientInfo` - Set client information

#### Device Control  
- `spruthub-cli accessory list` - List all accessories
- `spruthub-cli accessory search` - Smart device search with filters
- `spruthub-cli characteristic update` - Update device characteristics

#### Scenario Management
- `spruthub-cli scenario list` - List all scenarios
- `spruthub-cli scenario get <id>` - Get specific scenario
- `spruthub-cli scenario create` - Create new scenario
- `spruthub-cli scenario update <id>` - Update scenario
- `spruthub-cli scenario delete <id>` - Delete scenario

#### Room Management
- `spruthub-cli room list` - List all rooms
- `spruthub-cli room get <id>` - Get specific room

#### System Information
- `spruthub-cli system version` - Get system version

### Method Discovery

- `spruthub-cli methods list` - Show all available API methods
- `spruthub-cli methods categories` - Show all command categories
- `spruthub-cli methods describe <method>` - Show detailed method schema

## Usage Examples

### Smart Device Search
```bash
# Find devices in kitchen
spruthub-cli accessory search --room kitchen

# Search for lights
spruthub-cli accessory search --search "light" --type lightbulb

# Find online devices only
spruthub-cli accessory search --online
```

### Output Formats
```bash
# JSON output
spruthub-cli hub list --format json

# YAML output  
spruthub-cli accessory list --format yaml

# Default table format
spruthub-cli scenario list
```

### Using Parameters
```bash
# Via command line options
spruthub-cli characteristic update --a-id "12345" --s-id "67890" --c-id "switch"

# Via JSON parameters
spruthub-cli characteristic update --params '{"aId":"12345","sId":"67890","cId":"switch","control":{"value":{"boolValue":true}}}'

# Via JSON file
spruthub-cli scenario create --file scenario.json
```

### Profile Management
```bash
# Switch to different profile
spruthub-cli use production

# Check specific profile status
spruthub-cli status --profile development

# Use specific profile for commands
spruthub-cli hub list --profile production
```

## Configuration

Configuration and credentials are stored in `~/.spruthub/`:

- `config.json` - Profile configurations and preferences
- Passwords are stored securely in the system keychain via keytar

## Development

```bash
# Clone and install dependencies
git clone https://github.com/shady2k/spruthub-cli.git
cd spruthub-cli
npm install

# Build TypeScript
npm run build

# Run in development
npm run dev -- --help

# Lint code
npm run lint
```

## Architecture

- **TypeScript + ES Modules**: Modern JavaScript with full type safety
- **Dynamic Commands**: Auto-generated from spruthub-client Schema system
- **Secure Storage**: Keytar for credential encryption
- **Multiple Formats**: JSON, YAML, and table output
- **Client Wrapper**: Unified interface to spruthub-client with error handling

## Requirements

- Node.js >= 16.0.0
- Spruthub smart home system
- Network access to Spruthub WebSocket server

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with proper TypeScript typing
4. Add tests if applicable
5. Submit a pull request

## Support

- [GitHub Issues](https://github.com/shady2k/spruthub-cli/issues)
- [Spruthub Documentation](https://spruthub.ru/)
- [spruthub-client Library](https://github.com/shady2k/spruthub-client)