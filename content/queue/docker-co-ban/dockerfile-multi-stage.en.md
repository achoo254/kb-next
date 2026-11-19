---
title: Multi-stage Dockerfiles: heavy builds, light runtime images
tags: docker, dockerfile, multi-stage, image, build
type: lab
---

> [!TLDR]
> - A multi-stage Dockerfile uses several `FROM` lines: the first stages build, the last stage holds only what is needed to run.
> - `COPY --from=<stage>` copies exactly the build result into the final image; the compiler tools stay behind.
> - `docker build --target` lets you stop at one stage to debug or test.

## Goal

When people first learn Docker, many write a single Dockerfile: start from an image with a full compiler, install libraries, build, then run right there. The resulting image works but is very heavy, because it carries everything that was only needed at build time. This article introduces the **multi-stage build** to separate "building" from "running", so the final image is smaller and has less in it that does not belong.

You will package a small web server written in Go, build it in two stages, then compare sizes. If you do not have Docker yet, read [[Installing Docker Engine on Ubuntu 24.04 from Docker's official apt repository]] first.

## Preparation

- Docker Engine installed (the previous article used `sudo`; if you have not added yourself to the `docker` group, put `sudo` before every `docker` command below).
- An empty directory, for example `~/hello-docker`.
- An Internet connection to pull the `golang` and `alpine` images from Docker Hub.

Go is only an example, because Go compiles to a standalone executable. The multi-stage idea applies to any language that needs a build step, such as Java, Rust, or a front end that needs JavaScript bundling.

## Steps

### Step 1: Write the application

In `~/hello-docker`, create `go.mod`:

```text
module example.com/hello

go 1.24
```

and `main.go`:

```go
package main

import (
	"fmt"
	"log"
	"net/http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "Xin chào từ container")
	})
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	log.Fatal(http.ListenAndServe(":8080", nil))
}
```

The program listens on port 8080, returns a greeting at `/` (the text means "Hello from the container" in Vietnamese) and returns status 200 at `/healthz`. The second path will be useful in the next article.

### Step 2: Write a single-stage Dockerfile as a baseline

Create `Dockerfile.single`:

```dockerfile
FROM golang:1.24
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /usr/local/bin/hello .
EXPOSE 8080
ENTRYPOINT ["hello"]
```

Build it and look at the size:

```bash
docker build -f Dockerfile.single -t hello:single .
docker image ls hello
```

This image contains the whole Go toolchain, the source code and the layers of the base operating system: its size reaches hundreds of MB, even though the real program is a small file.

### Step 3: Write the multi-stage Dockerfile

Create `Dockerfile`:

```dockerfile
# Stage 1: build
FROM golang:1.24 AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/hello .

# Stage 2: run
FROM alpine:3.20
COPY --from=build /out/hello /usr/local/bin/hello
EXPOSE 8080
ENTRYPOINT ["hello"]
```

Three points to notice:

1. **Each `FROM` opens a new stage.** `AS build` names the first stage so it can be referred to later. The final image of a build is the last stage.
2. **`COPY --from=build`** copies a file from the `build` stage into the current stage. Everything else in the `build` stage (the compiler, the source, the cache) does not come along.
3. **`CGO_ENABLED=0`** tells Go to produce an executable that does not depend on the system's C libraries, so it runs on an `alpine` base too (which uses musl instead of glibc).

An ordering tip: copy `go.mod` and download dependencies *before* copying all the source. Docker caches layer by layer, so if you only edit `main.go`, the `go mod download` step is reused and the build is much faster.

### Step 4: Build and compare

```bash
docker build -t hello:multi .
docker image ls hello
```

You will see two lines: `hello:single` and `hello:multi`. The `multi` one is far smaller because it holds only the small `alpine` base plus one executable. The exact figures depend on the base image versions at the time you build, so look at the result on your own machine instead of trusting a fixed number.

To see what the layers of the final image consist of, use:

```bash
docker history hello:multi
```

## Verification

Run the container and call it:

```bash
docker run -d --name hello -p 8080:8080 hello:multi
curl http://127.0.0.1:8080/
curl -i http://127.0.0.1:8080/healthz
```

The first command prints "Xin chào từ container"; the second returns the status line `HTTP/1.1 200 OK`. Clean up when done:

```bash
docker rm -f hello
```

`docker rm -f` stops and removes the container named `hello`; any data that lived only inside the container is lost, and here there is nothing to keep.

### Stopping at one stage with `--target`

Sometimes you want to look at the build stage, for example to run tests or debug:

```bash
docker build --target build -t hello:build .
docker run --rm hello:build go version
```

The `--target` flag tells Docker to build only up to the stage with that name. It is a neat way to share one Dockerfile between development and production.

### Adding `.dockerignore`

When `COPY . .` copies the whole directory, files you do not need (such as `.git` and temporary files) are also sent into the build context. Create a `.dockerignore` file next to the Dockerfile:

```text
.git
*.md
Dockerfile*
```

This file makes the build context smaller and avoids accidentally copying sensitive files into the image.

## Common errors

- **`exec /usr/local/bin/hello: no such file or directory`** when running the container: the Go binary was built dynamically linked against C libraries that the `alpine` base does not have. Make sure you set `CGO_ENABLED=0`.
- **`COPY --from=build` says the file is not found**: the source path is a path *inside the build stage*, not on your machine. Check that `-o /out/hello` and the path in `COPY` match.
- **The build is slow even though you changed one line**: check the order of the instructions. If `COPY . .` comes before the dependency download, every small change invalidates the cache for that step.
- **A misspelled stage name**: `--from` and `--target` must match the name after `AS` exactly. If you do not name a stage you can use its number starting from 0, but a readable name is more durable.
- **Base images change over time**: a tag such as `alpine:3.20` still receives patches. For fully repeatable builds, also pin the image digest, and remember to update periodically so you do not miss security patches.

## Summary

The multi-stage build solves a simple problem: the tools needed to *make* a program should not sit in the image used to *run* it. You write several `FROM` lines, name the stages, then `COPY --from` exactly what you need to carry over. The result is a smaller image with less that does not belong in it, and faster rebuilds thanks to the cache. A small image is not the same as a safe one: the next article looks at running this very container as an ordinary user and adding a health check.

## References

- [Multi-stage builds](https://docs.docker.com/build/building/multi-stage/) – Docker Docs
- [Dockerfile reference](https://docs.docker.com/reference/dockerfile/) – Docker Docs
- [Building best practices](https://docs.docker.com/build/building/best-practices/) – Docker Docs
