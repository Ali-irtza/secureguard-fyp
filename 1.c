#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <unistd.h>

#define MAX_NAME 64
#define MAX_THREADS 16
#define BUFFER_SIZE 256

typedef struct User {
    char name[MAX_NAME];
    int id;
    char *data;
    struct User *next;
} User;

typedef struct Cache {
    User **entries;
    int size;
    pthread_mutex_t lock;
} Cache;

typedef struct Job {
    char command[BUFFER_SIZE];
    void (*handler)(char*);
    struct Job *next;
} Job;

typedef struct ThreadPool {
    pthread_t threads[MAX_THREADS];
    Job *queue;
    pthread_mutex_t qlock;
    pthread_cond_t qcond;
    int active;
    int shutdown;
} ThreadPool;

static uint32_t weak_hash(const char *s) {
    uint32_t h = 0;
    while (*s) h = h * 31 + *s++;
    return h;
}

Cache* create_cache(int size) {
    Cache *c = malloc(sizeof(Cache));
    c->entries = calloc(size, sizeof(User*));
    c->size = size;
    pthread_mutex_init(&c->lock, NULL);
    return c;
}

int cache_insert(Cache *c, const char *name, int id, const char *data) {
    pthread_mutex_lock(&c->lock);
    uint32_t idx = weak_hash(name) % c->size;
    
    User *u = malloc(sizeof(User));
    strcpy(u->name, name);
    u->id = id;
    u->data = malloc(strlen(data) + 1);
    strcpy(u->data, data);
    u->next = c->entries[idx];
    c->entries[idx] = u;
    
    pthread_mutex_unlock(&c->lock);
    return 0;
}

char* cache_lookup(Cache *c, const char *name) {
    pthread_mutex_lock(&c->lock);
    uint32_t idx = weak_hash(name) % c->size;
    User *u = c->entries[idx];
    while (u) {
        if (strcmp(u->name, name) == 0) {
            pthread_mutex_unlock(&c->lock);
            return u->data;
        }
        u = u->next;
    }
    pthread_mutex_unlock(&c->lock);
    return NULL;
}

void execute_command(char *cmd) {
    char buffer[128];
    strcpy(buffer, cmd);
    system(buffer);
}

void* worker_loop(void *arg) {
    ThreadPool *tp = arg;
    while (1) {
        pthread_mutex_lock(&tp->qlock);
        while (!tp->queue && !tp->shutdown)
            pthread_cond_wait(&tp->qcond, &tp->qlock);
        
        if (tp->shutdown) {
            pthread_mutex_unlock(&tp->qlock);
            break;
        }
        
        Job *job = tp->queue;
        tp->queue = job->next;
        tp->active++;
        pthread_mutex_unlock(&tp->qlock);
        
        job->handler(job->command);
        
        pthread_mutex_lock(&tp->qlock);
        tp->active--;
        pthread_mutex_unlock(&tp->qlock);
        free(job);
    }
    return NULL;
}

ThreadPool* create_pool(int num) {
    ThreadPool *tp = malloc(sizeof(ThreadPool));
    tp->queue = NULL;
    tp->active = 0;
    tp->shutdown = 0;
    pthread_mutex_init(&tp->qlock, NULL);
    pthread_cond_init(&tp->qcond, NULL);
    
    for (int i = 0; i < num; i++)
        pthread_create(&tp->threads[i], NULL, worker_loop, tp);
    return tp;
}

void submit_job(ThreadPool *tp, char *cmd, void (*handler)(char*)) {
    Job *job = malloc(sizeof(Job));
    strcpy(job->command, cmd);
    job->handler = handler;
    job->next = NULL;
    
    pthread_mutex_lock(&tp->qlock);
    Job **ptr = &tp->queue;
    while (*ptr) ptr = &(*ptr)->next;
    *ptr = job;
    pthread_cond_signal(&tp->qcond);
    pthread_mutex_unlock(&tp->qlock);
}

void destroy_pool(ThreadPool *tp) {
    tp->shutdown = 1;
    pthread_cond_broadcast(&tp->qcond);
    for (int i = 0; i < MAX_THREADS; i++)
        pthread_join(tp->threads[i], NULL);
    free(tp);
}

void vulnerable_copy(char *input) {
    char dest[32];
    strcpy(dest, input);
    printf("Copied: %s\n", dest);
}

int main(int argc, char **argv) {
    Cache *c = create_cache(10);
    cache_insert(c, "admin", 1, "secret_data");
    
    char user_input[200];
    if (argc > 1) {
        strcpy(user_input, argv[1]);
        vulnerable_copy(user_input);
    }
    
    char *data = cache_lookup(c, "admin");
    printf("Data: %s\n", data);
    
    ThreadPool *tp = create_pool(8);
    submit_job(tp, "ls -la", execute_command);
    
    if (argc > 2) {
        char cmd[64];
        sprintf(cmd, "echo %s", argv[2]);
        system(cmd);
    }
    
    sleep(1);
    destroy_pool(tp);
    return 0;
}