all: docker

docker:
	docker build -t semapps/nextgraph .
