// En src/app/services/esp32.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

// Definimos una interfaz para la respuesta de /status
export interface ButtonStatus {
  boton_a: boolean;
  boton_b: boolean;
  boton_c: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class Esp32Service {
  // Esta IP será establecida por el componente
  private esp32Ip: string = '192.168.1.100'; 

  constructor(private http: HttpClient) {}

  /**
   * Actualiza la IP del ESP32
   */
  setIp(ip: string) {
    this.esp32Ip = ip;
  }

  /**
   * Obtiene el estado de los botones (Polling)
   * Llama a: http://[IP]/status
   */
  getStatus(): Observable<ButtonStatus> {
    return this.http.get<ButtonStatus>(`http://${this.esp32Ip}/status`).pipe(
      timeout(1000), // Si no responde en 1 segundo, falla
      catchError((err) => {
        // Si falla, simplemente propagamos el error
        return throwError(() => new Error('ESP32 connection failed'));
      })
    );
  }

  /**
   * Envía un comando para controlar un LED
   * Llama a: http://[IP]/led?pin=X&state=Y
   */
  setLed(pin: number, state: boolean): Observable<string> {
    const stateValue = state ? 1 : 0;
    return this.http
      .get(`http://${this.esp32Ip}/led?pin=${pin}&state=${stateValue}`, {
        responseType: 'text', // Esperamos un "OK" como texto
      })
      .pipe(
        timeout(500), // Timeout corto para comandos
        catchError(() => {
          // No nos importa mucho si el comando LED falla, no detenemos el juego
          return throwError(() => new Error('LED command failed'));
        })
      );
  }
}