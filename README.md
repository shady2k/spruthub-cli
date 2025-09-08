# Sprut.hub CLI (Русский)

[![npm version](https://badge.fury.io/js/spruthub-cli.svg)](https://badge.fury.io/js/spruthub-cli)

Инструмент командной строки для управления устройствами умного дома [Sprut.hub](https://spruthub.ru/). Создан с использованием TypeScript и ES-модулей, предоставляет полный доступ ко всем методам API Sprut.hub через динамическую генерацию команд.

## Возможности

- **Динамическая генерация команд**: Все API-методы из spruthub-client автоматически доступны как команды CLI
- **Множественные форматы вывода**: JSON, YAML и форматированные таблицы
- **Безопасное управление учетными данными**: Зашифрованное хранение учетных данных с использованием keytar
- **Управление профилями**: Поддержка нескольких профилей устройств
- **Управление скриптами**: Push/pull сценариев
- **TypeScript**: Полная типовая безопасность и современные ES-модули
- **Обнаружение методов**: Встроенное исследование API и документация

## Установка

```bash
npm install -g spruthub-cli
```

## Быстрый старт

1. **Вход в ваше устройство Sprut.hub**:
   ```bash
   spruthub-cli login
   ```

2. **Проверка статуса подключения**:
   ```bash
   spruthub-cli status
   ```

3. **Обнаружение доступных команд**:
   ```bash
   spruthub-cli methods list
   ```

4. **Список ваших устройств**:
   ```bash
   spruthub-cli accessory list
   ```

## Команды

### Основные команды

- `spruthub-cli login` - Настройка аутентификации с устройством Sprut.hub
- `spruthub-cli logout` - Удаление сохраненных учетных данных
- `spruthub-cli status` - Проверка статуса подключения и информации о профиле
- `spruthub-cli use <profile>` - Переключение между профилями
- `spruthub-cli push <source>` - Загрузка сценариев на устройство
- `spruthub-cli pull [destination]` - Скачивание сценариев с устройства
- `spruthub-cli deploy <scenarioId>` - Развертывание сценария: push, запуск и мониторинг ошибок
- `spruthub-cli logs [options]` - Просмотр и потоковая передача системных логов с возможностью фильтрации

### Динамические API команды

Все методы API spruthub-client доступны как команды, организованные по категориям:

#### Управление хабом
- `spruthub-cli hub list` - Список всех хабов Sprut.hub в системе
- `spruthub-cli server clientInfo` - Установка информации о клиенте для текущего подключения

#### Управление устройствами
- `spruthub-cli accessory list` - Список всех аксессуаров (умных устройств) с сервисами и характеристиками
- `spruthub-cli accessory search` - Поиск и фильтрация аксессуаров с умной фильтрацией
- `spruthub-cli characteristic update` - Обновление значения характеристики устройства

#### Управление сценариями
- `spruthub-cli scenario list` - Список всех сценариев
- `spruthub-cli scenario get <index>` - Получение конкретного сценария по индексу
- `spruthub-cli scenario create` - Создание нового сценария
- `spruthub-cli scenario update <index>` - Обновление существующего сценария
- `spruthub-cli scenario delete <index>` - Удаление сценария
- `spruthub-cli scenario run <index>` - Запуск сценария

#### Управление комнатами
- `spruthub-cli room list` - Список всех комнат
- `spruthub-cli room get <id>` - Получение конкретной комнаты по ID

#### Системная информация
- `spruthub-cli server version` - Получение информации о версии

#### Управление логами
- `spruthub-cli log list` - Получение системных логов с опциональным ограничением количества

### Обнаружение методов

- `spruthub-cli methods list` - Показать все доступные API методы
- `spruthub-cli methods categories` - Показать все категории команд
- `spruthub-cli methods describe <method>` - Показать детальную схему метода

## Примеры использования

### Умный поиск устройств
```bash
# Поиск аксессуаров с умной фильтрацией
spruthub-cli accessory search

# Поиск конкретных устройств
spruthub-cli accessory search --params '{"search":"light"}'

# Фильтрация по комнате или другим критериям
spruthub-cli accessory search --params '{"roomName":"kitchen"}'
```

### Форматы вывода
```bash
# JSON вывод
spruthub-cli hub list --format json

# YAML вывод
spruthub-cli accessory list --format yaml

# Табличный формат по умолчанию
spruthub-cli scenario list
```

### Использование параметров
```bash
# Обновление характеристики устройства
spruthub-cli characteristic update --params '{"aId":"12345","sId":"67890","cId":"switch","control":{"value":{"boolValue":true}}}'

# Запуск сценария
spruthub-cli scenario run 0

# Получение конкретного сценария
spruthub-cli scenario get 0

# Через JSON файл
spruthub-cli scenario create --file scenario.json
```

### Управление профилями
```bash
# Переключение на другой профиль
spruthub-cli use production

# Проверка статуса конкретного профиля
spruthub-cli status --profile development

# Использование конкретного профиля для команд
spruthub-cli hub list --profile production
```

### Рабочий процесс развертывания
```bash
# Развертывание сценария (push + run + показать логи)
spruthub-cli deploy 0

# Развертывание без показа логов
spruthub-cli deploy 0 --no-logs

# Развертывание с конкретным профилем
spruthub-cli deploy 0 --profile production
```

### Управление логами
```bash
# Показать недавние логи
spruthub-cli log list

# Показать определенное количество логов
spruthub-cli log list -n 50

# Фильтрация логов по сценарию
spruthub-cli log list --scenario-id 0

# Отслеживание логов в реальном времени (как tail -f)
spruthub-cli log list --follow

# Отслеживание логов для конкретного сценария
spruthub-cli log list --follow --scenario-id 0 -n 10
```

## Конфигурация

Конфигурация и учетные данные хранятся в `~/.spruthub/`:

- `config.json` - Конфигурации профилей и настройки
- Пароли безопасно хранятся в системной связке ключей через keytar

## Разработка

```bash
# Клонирование и установка зависимостей
git clone https://github.com/shady2k/spruthub-cli.git
cd spruthub-cli
npm install

# Сборка TypeScript
npm run build

# Запуск в режиме разработки
npm run dev -- --help

# Линтинг кода
npm run lint
```

## Архитектура

- **TypeScript + ES Modules**: Современный JavaScript с полной типовой безопасностью
- **Динамические команды**: Автогенерируемые из системы Schema spruthub-client
- **Безопасное хранение**: Keytar для шифрования учетных данных
- **Множественные форматы**: JSON, YAML и табличный вывод
- **Обертка клиента**: Унифицированный интерфейс для spruthub-client с обработкой ошибок

## Требования

- Node.js >= 20.0.0
- Система умного дома Sprut.hub
- Сетевой доступ к WebSocket серверу Sprut.hub

## Лицензия

MIT

## Содействие

1. Сделайте форк репозитория
2. Создайте ветку функций
3. Внесите изменения с правильной типизацией TypeScript
4. Добавьте тесты, если применимо
5. Отправьте pull request

## Поддержка

- [GitHub Issues](https://github.com/shady2k/spruthub-cli/issues)
- [Документация Sprut.hub](https://spruthub.ru/)
- [Библиотека spruthub-client](https://github.com/shady2k/spruthub-client)

---

# Sprut.hub CLI (English)

[![npm version](https://badge.fury.io/js/spruthub-cli.svg)](https://badge.fury.io/js/spruthub-cli)

A command-line interface tool for managing [Sprut.hub](https://spruthub.ru/) smart home devices. Built with TypeScript and ES modules, providing complete access to all Sprut.hub API methods through dynamic command generation.

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

1. **Login to your Sprut.hub device**:
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

- `spruthub-cli login` - Setup authentication with Sprut.hub device
- `spruthub-cli logout` - Remove saved credentials  
- `spruthub-cli status` - Check connection status and profile info
- `spruthub-cli use <profile>` - Switch between profiles
- `spruthub-cli push <source>` - Upload scenarios/scripts to device
- `spruthub-cli pull [destination]` - Download scenarios from device
- `spruthub-cli deploy <scenarioId>` - Deploy scenario: push, run, and monitor for errors
- `spruthub-cli logs [options]` - View and stream system logs with filtering options

### Dynamic API Commands

All spruthub-client API methods are available as commands, organized by category:

#### Hub Management
- `spruthub-cli hub list` - List all Sprut.hub devices/hubs in the system
- `spruthub-cli server clientInfo` - Set client information for current connection

#### Device Control  
- `spruthub-cli accessory list` - List all accessories (smart devices) with services and characteristics
- `spruthub-cli accessory search` - Search and filter accessories with smart filtering
- `spruthub-cli characteristic update` - Update a characteristic value on a device

#### Scenario Management
- `spruthub-cli scenario list` - List all scenarios
- `spruthub-cli scenario get <index>` - Get a specific scenario by index
- `spruthub-cli scenario create` - Create a new scenario
- `spruthub-cli scenario update <index>` - Update an existing scenario
- `spruthub-cli scenario delete <index>` - Delete a scenario
- `spruthub-cli scenario run <index>` - Run/execute a scenario

#### Room Management
- `spruthub-cli room list` - List all rooms
- `spruthub-cli room get <id>` - Get a specific room by ID

#### System Information
- `spruthub-cli server version` - Get version information

#### Log Management
- `spruthub-cli log list` - Get system logs with optional count limit
- `spruthub-cli log subscribe` - Subscribe to real-time log streaming via WebSocket
- `spruthub-cli log unsubscribe` - Unsubscribe from real-time log streaming

### Method Discovery

- `spruthub-cli methods list` - Show all available API methods
- `spruthub-cli methods categories` - Show all command categories
- `spruthub-cli methods describe <method>` - Show detailed method schema

## Usage Examples

### Smart Device Search
```bash
# Search accessories with smart filtering
spruthub-cli accessory search

# Search for specific devices
spruthub-cli accessory search --params '{"search":"light"}'

# Filter by room or other criteria
spruthub-cli accessory search --params '{"roomName":"kitchen"}'
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
# Update device characteristic
spruthub-cli characteristic update --params '{"aId":"12345","sId":"67890","cId":"switch","control":{"value":{"boolValue":true}}}'

# Run a scenario
spruthub-cli scenario run --params '{"index":0}'

# Get specific scenario
spruthub-cli scenario get --params '{"index":0}'

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

### Deployment Workflow
```bash
# Deploy a scenario (push + run + show logs)
spruthub-cli deploy 0

# Deploy without showing logs
spruthub-cli deploy 0 --no-logs

# Deploy with specific profile
spruthub-cli deploy 0 --profile production
```

### Log Management
```bash
# Show recent logs
spruthub-cli log list

# Show specific number of logs
spruthub-cli log list -n 50

# Filter logs by scenario
spruthub-cli log list --scenario-id 0

# Follow logs in real-time (like tail -f)
spruthub-cli log list --follow

# Follow logs for specific scenario
spruthub-cli log list --follow --scenario-id 0 -n 10
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

- Node.js >= 20.0.0
- Sprut.hub smart home system
- Network access to Sprut.hub WebSocket server

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
- [Sprut.hub Documentation](https://spruthub.ru/)
- [spruthub-client Library](https://github.com/shady2k/spruthub-client)