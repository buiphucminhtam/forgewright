#compdef forge

# Forge zsh completion

local -a commands options tools_commands skills_commands config_commands

commands=(
  'tools:Tool registry management'
  'skills:Skill management'
  'config:Configuration management'
  'doctor:Run diagnostics'
  'validate:Quality gate validation'
  'help:Show help'
  'version:Show version'
)

tools_commands=(
  'list:List all tools'
  'search:Search tools'
  'call:Call a tool by name'
)

skills_commands=(
  'list:List all skills'
  'search:Search skills'
  'categories:List skill categories'
)

config_commands=(
  'get:Get a configuration value'
  'set:Set a configuration value'
  'list:List all configuration values'
  'init:Initialize configuration file'
  'delete:Delete a configuration value'
)

options=(
  '-j[Force JSON output]' '--json[Force JSON output]'
  '--no-color[Disable colored output]'
  '-q[Suppress stdout output]' '--quiet[Suppress stdout output]'
  '--debug[Enable debug mode]'
  '-V[Show version number]' '--version[Show version number]'
  '-h[Show help]' '--help[Show help]'
)

forge_tool_names=(
  'orchestrator.execute'
  'skills.list'
  'skills.search'
  'validate.quality'
  'config.get'
  'config.set'
  'config.list'
  'doctor.check'
  'engineering.software'
  'engineering.frontend'
  'engineering.qa'
  'engineering.security'
  'devops.deploy'
  'devops.database'
  'ai.engineer'
  'ai.prompt'
  'game.design'
  'game.unity'
  'game.unreal'
  'meta.polymath'
  'meta.memory'
)

_arguments -s \
  $options \
  '1: :->command' \
  '2: :->subcommand' \
  '3: :->args' \
  '*:: :->rest'

case $state in
  command)
    _describe 'command' commands
    ;;
  subcommand)
    case $line[1] in
      tools)
        _describe 'subcommand' tools_commands
        ;;
      skills)
        _describe 'subcommand' skills_commands
        ;;
      config)
        _describe 'subcommand' config_commands
        ;;
      doctor)
        _arguments \
          '-v[Verbose output]' '--verbose[Verbose output]' \
          $options
        ;;
      validate)
        _arguments \
          '-l[Validation level]:level:(1 2 3)' '--level[Validation level]:level:(1 2 3)' \
          '--strict[Treat warnings as failures]' \
          '--report[Write report to file]:file:_files' \
          $options
        ;;
    esac
    ;;
  args)
    case $line[1] in
      tools)
        case $line[2] in
          call)
            _describe 'tool name' forge_tool_names
            ;;
          list|search)
            _arguments \
              '-c[Filter by category]:category:' \
              '--category[Filter by category]:category:' \
              '-s[Search query]:query:' \
              '--search[Search query]:query:' \
              $options
            ;;
        esac
        ;;
      skills)
        case $line[2] in
          list|search|categories)
            _arguments \
              '-c[Filter by category]:category:' \
              '--category[Filter by category]:category:' \
              '-s[Search query]:query:' \
              '--search[Search query]:query:' \
              $options
            ;;
        esac
        ;;
      config)
        case $line[2] in
          get|delete)
            _arguments $options
            ;;
          set)
            _arguments $options
            ;;
          list|init)
            _arguments $options
            ;;
        esac
        ;;
    esac
    ;;
esac
