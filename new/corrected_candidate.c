#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void save_note(const char *note) {
    char title[32];
    char *backup;
    size_t note_len;
    
    if (note == NULL || strnlen(note, sizeof(note)) >= sizeof(note)) {
        printf("Invalid note\n");
        return;
    }
    
    note_len = strnlen(note, sizeof(note));
    if (note_len >= sizeof(title)) {
        printf("Title too long\n");
        return;
    }
    snprintf(title, sizeof(title), "%s", note);
    
    backup = malloc(note_len + 1);
    if (backup == NULL) {
        printf("Memory allocation failed\n");
        return;
    }
    memcpy(backup, note, note_len + 1);
    printf("Note saved: %s\n", backup);
    free(backup);
}

int main() {
    save_note("example");
    return 0;
}