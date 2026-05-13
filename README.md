# SciSpace

SciSpace is a Vite+ / React based scientific data workspace prototype. It provides a Figma-like
canvas with movable windows for data browsing, tabular editing, plotting, command history, and a
SciSpace REPL terminal.

## Development

```sh
pnpm install
pnpm dev
```

## Build

```sh
pnpm build
```

## Go Binary Build

The Go executable embeds the built `dist/` directory and serves it locally.

```sh
pnpm binary:build
./bin/scispace
```

Build a Windows x86_64 executable:

```sh
pnpm binary:build:windows-x64
```

The executable starts a local server at `http://127.0.0.1:4173/` by default. The port can be changed:

```sh
./bin/scispace --port 4183
```

## License

MIT License. See [LICENSE](./LICENSE).
