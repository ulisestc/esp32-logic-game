import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

export interface ButtonStatus {
  boton_a: boolean;
  boton_b: boolean;
  boton_c: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class Esp32Service {
  private esp32Ip: string = '192.168.1.100';

  constructor(private http: HttpClient) {}

  setIp(ip: string) {
    this.esp32Ip = ip;
  }

  getStatus(): Observable<ButtonStatus> {
    return this.http.get<ButtonStatus>(`http://${this.esp32Ip}/status`).pipe(
      timeout(1000),
      catchError((err) => {
        return throwError(() => new Error('ESP32 connection failed'));
      })
    );
  }

  setLed(pin: number, state: boolean): Observable<string> {
    const stateValue = state ? 1 : 0;
    return this.http
      .get(`http://${this.esp32Ip}/led?pin=${pin}&state=${stateValue}`, {
        responseType: 'text',
      })
      .pipe(
        timeout(500),
        catchError(() => {
          return throwError(() => new Error('LED command failed'));
        })
      );
  }
}
