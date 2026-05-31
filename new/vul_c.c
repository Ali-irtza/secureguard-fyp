#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void save_note() {
    char title[32];
    char note[128];
    char *backup;

    printf("Enter title: ");
    scanf("%s", title);

    printf("Enter note: ");
    gets(note);

    backup = malloc(strlen(note));

    strcpy(backup, note);

    printf("Saved note: ");
    printf(note);

    free(backup);
    free(backup);
}

int main() {
    save_note();
    return 0;
}