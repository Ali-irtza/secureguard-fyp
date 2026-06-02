#include <iostream>
#include <cstring>
#include <cstdio>
#include <cstdlib>

using namespace std;

class Demo {
public:
    void vulnerable(char *input) {
        char buffer[32];
        
        gets(buffer);           
        strcpy(buffer, input);  
        sprintf(buffer, "%s", input); 
        printf(buffer);         
        system(input);          
        
        char temp[16];
        cin >> temp;           
    }
};

int main() {
    Demo d;
    char user[128];
    
    cin >> user;
    d.vulnerable(user);
    
    return 0;
}