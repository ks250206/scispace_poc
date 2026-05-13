package main

import (
	"embed"
	"flag"
	"io/fs"
	"log"
	"net/http"
)

//go:embed dist/*
var embeddedDist embed.FS

func main() {
	host := flag.String("host", "127.0.0.1", "host")
	port := flag.String("port", "4173", "port")
	flag.Parse()

	dist, err := fs.Sub(embeddedDist, "dist")
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(dist)))

	addr := *host + ":" + *port
	log.Printf("SciSpace is running at http://%s/", addr)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
