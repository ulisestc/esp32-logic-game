import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http'; // <-- ¡Importante!
import { FormsModule } from '@angular/forms';           // <-- ¡Importante!

import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    HttpClientModule, // <-- Añadir
    FormsModule,      // <-- Añadir
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}