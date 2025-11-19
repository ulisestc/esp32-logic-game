import { Component, OnDestroy } from '@angular/core';
import { Esp32Service, ButtonStatus } from './services/esp32.service';
import { Subscription, timer, EMPTY } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnDestroy {
  // --- Configuración y Estado ---
  esp32_ip: string = '192.168.1.100'; // IP por defecto
  is_connected: boolean = false;
  is_polling: boolean = false;
  showModal: boolean = false; // Controla el modal de "Siguiente Nivel"

  private pollSubscription: Subscription | null = null;

  // --- Estado del Juego (FSM) ---
  current_challenge = 1;
  last_led_output_state: boolean | null = null;
  button_states: ButtonStatus = { boton_a: false, boton_b: false, boton_c: false };
  current_led_output: boolean = false; // El estado lógico (virtual)

  // --- Pines Físicos ---
  readonly led_pins_progress = [13, 25, 21, 32, 23, 26];
  readonly led_pin_status = 27;

// En src/app/app.component.ts

// En src/app/app.component.ts

  // --- Definición de Retos ---
  readonly challenges: any = {
    1: { 
      nombre: 'Reto 1: Compuerta AND (Y)', 
      instruccion: 'Mover A, B y C a la posición ON.', 
      led_esperado: 'ON',
      explicacion: 'La compuerta AND equivale al operador "&&". La salida es "true" (ON) si, y solo si, TODAS sus entradas (A, B y C) son "true" simultáneamente.'
    },
    2: { 
      nombre: 'Reto 2: Compuerta OR (O)', 
      instruccion: 'Mover CUALQUIER interruptor (A, B o C) a ON.', 
      led_esperado: 'ON',
      explicacion: 'La compuerta OR equivale al operador "||". La salida es "true" (ON) si CUALQUIERA de sus entradas (A, B o C) es "true". Solo es "false" si todas son "false".'
    },
    3: { 
      nombre: 'Reto 3: Compuerta NOT (NO)', 
      instruccion: 'Mover el interruptor A a la posición ON.', 
      led_esperado: 'OFF',
      explicacion: 'La compuerta NOT es un inversor, equivale al operador "!". Simplemente invierte el valor de la entrada. Si la entrada (A) es "true", la salida es "false", y viceversa. (Este reto solo usa el botón A).'
    },
    4: { 
      nombre: 'Reto 4: Compuerta NAND (NO Y)', 
      instruccion: 'Mover A, B y C a la posición ON.', 
      led_esperado: 'OFF',
      explicacion: 'NAND significa "NOT AND". Es el resultado de una compuerta AND, pero invertido (como !(A && B && C)). La salida es "true" siempre, EXCEPTO cuando todas las entradas son "true".'
    },
    5: { 
      nombre: 'Reto 5: Compuerta NOR (NO O)', 
      instruccion: 'Mover CUALQUIER interruptor (A, B o C) a ON.', 
      led_esperado: 'OFF',
      explicacion: 'NOR significa "NOT OR". Es el resultado de una compuerta OR, pero invertido (como !(A || B || C)). La salida es "true" únicamente si TODAS las entradas son "false".'
    },
    6: { 
      nombre: 'Reto 6: Compuerta XOR (O Exclusiva)', 
      instruccion: 'Mover un número IMPAR de interruptores a ON (1 o 3).', 
      led_esperado: 'ON',
      explicacion: 'XOR equivale al operador "^" (en muchos lenguajes). La salida es "true" si las entradas son diferentes. Con 3 entradas, la salida es "true" si hay un número IMPAR de entradas "true".'
    },
    7: { 
      nombre: '¡Clase Completada!', 
      instruccion: '¡Felicidades! Has completado todos los retos.', 
      led_esperado: '---',
      explicacion: '¡Buen trabajo! Has cubierto los fundamentos de la lógica booleana.'
    }
  };

  constructor(private esp32: Esp32Service) {}

  /**
   * Inicia el Polling. Se llama desde el botón "Conectar".
   */
  startPolling() {
    if (this.is_polling) return;

    this.is_polling = true;
    this.esp32.setIp(this.esp32_ip);

    // Apagar todos los LEDs físicos al iniciar
    this.resetAllLeds();

    // Iniciar el bucle de polling (cada 200ms)
    this.pollSubscription = timer(0, 200) // 0ms de espera, luego cada 200ms
      .pipe(
        switchMap(() =>
          this.esp32.getStatus().pipe(
            catchError(err => {
              this.is_connected = false;
              // Resetear botones virtuales si hay error
              this.button_states = { boton_a: false, boton_b: false, boton_c: false };
              // throw err; // Detener este ciclo y esperar al siguiente timer
                          return EMPTY;
            })
          )
        )
      )
      .subscribe((status: ButtonStatus) => {
        this.is_connected = true;
        this.button_states = status;

        // ¡Aquí se ejecuta la lógica del juego!
        this.check_challenge_logic();
      });
  }

  /**
   * Detiene el polling al cerrar (buena práctica)
   */
  ngOnDestroy() {
    this.pollSubscription?.unsubscribe();
    this.resetAllLeds(); // Apagar todo al salir
  }

  /**
   * Apaga todos los LEDs físicos.
   */
  resetAllLeds() {
    const allPins = [...this.led_pins_progress, this.led_pin_status];
    allPins.forEach(pin => {
      // Usamos .subscribe() porque es 'fire and forget'
      this.esp32.setLed(pin, false).subscribe();
    });
  }

  /**
   * Actualiza la barra de progreso física
   */
  updatePhysicalProgressBar(completed_challenges: number) {
    this.led_pins_progress.forEach((pin, index) => {
      const state = index < completed_challenges;
      this.esp32.setLed(pin, state).subscribe();
    });
  }

  /**
   * La LÓGICA CENTRAL (FSM)
   * (Casi idéntica a tu código Python)
   */
  check_challenge_logic() {
    // Si el modal está abierto, pausamos la lógica
    if (this.showModal) return;

    if (this.current_challenge > 6) {
      this.current_led_output = false; // O lo que quieras hacer al ganar
      return;
    }

    const a = this.button_states.boton_a;
    const b = this.button_states.boton_b;
    const c = this.button_states.boton_c;

    let success = false;
    let led_output = false;

    switch (this.current_challenge) {
      case 1: // AND
        led_output = a && b && c;
        success = led_output;
        break;
      case 2: // OR
        led_output = a || b || c;
        success = led_output;
        break;
      case 3: // NOT
        led_output = !a;
        success = a;
        break;
      case 4: // NAND
        led_output = !(a && b && c);
        success = a && b && c;
        break;
      case 5: // NOR
        led_output = !(a || b || c);
        success = a || b || c;
        break;
      case 6: // XOR
        const num_on = (a ? 1 : 0) + (b ? 1 : 0) + (c ? 1 : 0);
        led_output = (num_on % 2 !== 0);
        success = led_output;
        break;
    }

    // Actualizar el LED virtual (GUI)
    this.current_led_output = led_output;

    // Actualizar el LED de estado físico (solo si cambia)
    if (led_output !== this.last_led_output_state) {
      this.esp32.setLed(this.led_pin_status, led_output).subscribe();
      this.last_led_output_state = led_output;
    }

    // --- Lógica de Éxito ---
    if (success) {
      console.log(`Reto ${this.current_challenge} completado!`);

      // 1. Actualizar barra de progreso física
      this.updatePhysicalProgressBar(this.current_challenge);

      // 2. Mostrar el modal (esto pausa la lógica)
      this.showModal = true;
    }
  }

  /**
   * Se llama desde el botón del modal
   */
  advanceToNextLevel() {
    // 1. Ocultar el modal (esto reanuda la lógica)
    this.showModal = false;

    // 2. Avanzar al siguiente reto
    this.current_challenge += 1;

    // 3. Forzar reseteo del LED físico
    this.last_led_output_state = null;
    this.esp32.setLed(this.led_pin_status, false).subscribe();
    this.current_led_output = false;
  }
}
