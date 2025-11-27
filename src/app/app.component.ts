import { Component, OnDestroy, OnInit } from '@angular/core';
import { Esp32Service, ButtonStatus } from './services/esp32.service';
import { Subscription, timer, EMPTY } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';

interface Challenge {
  nombre: string;
  expression_display: string;
  instruccion: string;
  evaluate: (a: boolean, b: boolean, c: boolean) => boolean;
  explicacion: string;
  led_esperado: string;
  manual_advance?: boolean;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnDestroy, OnInit {
  // Configuración de red
  esp32_ip: string = '192.168.1.100'; 
  is_connected: boolean = false;
  is_polling: boolean = false;
  showModal: boolean = false; 

  private pollSubscription: Subscription | null = null;

  // Estado del juego
  current_challenge_index = 0;
  last_led_output_state: boolean | null = null;
  button_states: ButtonStatus = { boton_a: false, boton_b: false, boton_c: false };
  current_led_output: boolean = false; 

  // Definición de pines físicos
  readonly led_pins_progress = [13, 25, 21, 32, 23, 26];
  readonly led_pin_status = 27;

  challenges: Challenge[] = [];

  readonly victoryChallenge: Challenge = {
    nombre: '¡Juego Completado!',
    expression_display: 'WIN',
    instruccion: '¡Felicidades! Has completado el entrenamiento lógico.',
    evaluate: () => false,
    explicacion: 'Has dominado la lectura y resolución de expresiones lógicas.',
    led_esperado: '---'
  };

  constructor(private esp32: Esp32Service) { }

  ngOnInit() {
    this.initializeGame();
  }

  initializeGame() {
    // Fase de tutorial
    const tutorials: Challenge[] = [
      {
        nombre: 'Tutorial 1: El Inversor (NOT)',
        expression_display: '!A',
        instruccion: 'Observa el LED. Pulsa el interruptor A y observa cómo cambia el LED.',
        evaluate: (a, b, c) => !a,
        explicacion: 'El operador "!" (NOT) invierte el valor de la entrada. \nCuando A está APAGADO, !A es VERDADERO y el LED se enciende.\nCuando A está ENCENDIDO, !A es FALSO y el LED se apaga.\n¡Experimenta pulsando A!',
        led_esperado: '---', 
        manual_advance: true
      },
      {
        nombre: 'Tutorial 2: La Conjunción (AND)',
        expression_display: 'A && B',
        instruccion: 'Configura los interruptores para que AMBOS sean verdaderos.',
        evaluate: (a, b, c) => a && b,
        explicacion: 'El operador "&&" (AND) solo es verdadero si TODAS sus entradas son verdaderas.\nNecesitas encender A y B simultáneamente.',
        led_esperado: 'ON',
        manual_advance: true
      },
      {
        nombre: 'Tutorial 3: La Disyunción (OR)',
        expression_display: 'A || B',
        instruccion: 'Configura los interruptores para que AL MENOS UNO sea verdadero.',
        evaluate: (a, b, c) => a || b,
        explicacion: 'El operador "||" (OR) es verdadero si CUALQUIERA de sus entradas es verdadera.\nPuedes encender A, o B, o ambos.',
        led_esperado: 'ON',
        manual_advance: true
      },
      {
        nombre: 'Tutorial 4: O Exclusiva (XOR)',
        expression_display: 'A ^ B',
        instruccion: 'Configura los interruptores para que SOLO UNO sea verdadero.',
        evaluate: (a, b, c) => (a ? 1 : 0) + (b ? 1 : 0) === 1,
        explicacion: 'El operador "^" (XOR) es verdadero si las entradas son DIFERENTES.\nEnciende A o B, pero NO ambos a la vez.',
        led_esperado: 'ON',
        manual_advance: true
      },
      {
        nombre: 'Tutorial 5: Expresión Combinada',
        expression_display: 'A && B && !C',
        instruccion: 'Pon a prueba lo aprendido. Recuerda: !C significa "No C".',
        evaluate: (a, b, c) => a && b && !c,
        explicacion: 'Analiza por partes:\n1. A debe ser ON\n2. B debe ser ON\n3. !C debe ser verdadero (así que C debe ser OFF).',
        led_esperado: 'ON',
        manual_advance: true
      }
    ];

    // Fase de retos aleatorios
    const randomChallenges = this.generateRandomChallenges(6);

    this.challenges = [...tutorials, ...randomChallenges];
    this.current_challenge_index = 0;

    this.current_led_output = false;
    this.last_led_output_state = null;
    this.showModal = false;
  }

  restartGame() {
    this.initializeGame();
    this.resetAllLeds();
  }

  generateRandomChallenges(count: number): Challenge[] {
    const generated: Challenge[] = [];
    for (let i = 0; i < count; i++) {
      generated.push(this.createRandomChallenge(i + 1));
    }
    return generated;
  }

  createRandomChallenge(levelNum: number): Challenge {
    const ops = ['&&', '||', '^']; 
    const vars = ['A', 'B', 'C'];

    const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
    const coinFlip = () => Math.random() > 0.5;

    let exprStr = '';
    let evalFunc: (a: boolean, b: boolean, c: boolean) => boolean = () => false;
    let description = '';

    const complexity = levelNum <= 2 ? 1 : (levelNum <= 4 ? 2 : 3);

    let isValid = false;
    while (!isValid) {
      if (complexity === 1) {
        const v1 = pick(vars);
        let v2 = pick(vars);
        while (v1 === v2) v2 = pick(vars);
        const op = pick(ops);

        exprStr = `${v1} ${op} ${v2}`;
        description = `Resuelve la operación: ${v1} ${this.getOpName(op)} ${v2}`;

        evalFunc = (a, b, c) => {
          const val1 = v1 === 'A' ? a : (v1 === 'B' ? b : c);
          const val2 = v2 === 'A' ? a : (v2 === 'B' ? b : c);
          return this.evalOp(op, val1, val2);
        };
      } else if (complexity === 2) {
        const v1 = pick(vars);
        let v2 = pick(vars);
        while (v1 === v2) v2 = pick(vars);
        const op = pick(ops);
        const negateFirst = coinFlip();

        if (negateFirst) {
          exprStr = `!${v1} ${op} ${v2}`;
          description = `Ten cuidado con el NOT (!) en ${v1}.`;
        } else {
          exprStr = `${v1} ${op} !${v2}`;
          description = `Ten cuidado con el NOT (!) en ${v2}.`;
        }

        evalFunc = (a, b, c) => {
          let val1 = v1 === 'A' ? a : (v1 === 'B' ? b : c);
          let val2 = v2 === 'A' ? a : (v2 === 'B' ? b : c);
          if (negateFirst) val1 = !val1;
          else val2 = !val2;
          return this.evalOp(op, val1, val2);
        };
      } else {
        const op1 = pick(ops);
        const op2 = pick(ops);
        const vs = ['A', 'B', 'C'].sort(() => Math.random() - 0.5);

        if (coinFlip()) {
          exprStr = `(${vs[0]} ${op1} ${vs[1]}) ${op2} ${vs[2]}`;
          description = `Resuelve primero el paréntesis: (${vs[0]} ${this.getOpName(op1)} ${vs[1]}).`;
          evalFunc = (a, b, c) => {
            const vals = vs.map(v => v === 'A' ? a : (v === 'B' ? b : c));
            const res1 = this.evalOp(op1, vals[0], vals[1]);
            return this.evalOp(op2, res1, vals[2]);
          };
        } else {
          if (op1 !== op2) {
            exprStr = `(${vs[0]} ${op1} ${vs[1]}) ${op2} ${vs[2]}`;
            description = `Resuelve primero el paréntesis.`;
            evalFunc = (a, b, c) => {
              const vals = vs.map(v => v === 'A' ? a : (v === 'B' ? b : c));
              const res1 = this.evalOp(op1, vals[0], vals[1]);
              return this.evalOp(op2, res1, vals[2]);
            };
          } else {
            exprStr = `${vs[0]} ${op1} ${vs[1]} ${op2} ${vs[2]}`;
            description = `Operadores iguales, evalúa de izquierda a derecha.`;
            evalFunc = (a, b, c) => {
              const vals = vs.map(v => v === 'A' ? a : (v === 'B' ? b : c));
              const res1 = this.evalOp(op1, vals[0], vals[1]);
              return this.evalOp(op2, res1, vals[2]);
            };
          }
        }
      }

      if (evalFunc(false, false, false) === false) {
        isValid = true;
      }
    }

    return {
      nombre: `Nivel Aleatorio ${levelNum}`,
      expression_display: exprStr,
      instruccion: 'Configura los interruptores para que la expresión sea VERDADERA.',
      evaluate: evalFunc,
      explicacion: description + '\nRecuerda: && (AND), || (OR), ^ (XOR), ! (NOT).',
      led_esperado: 'ON'
    };
  }

  getOpName(op: string): string {
    if (op === '&&') return 'AND';
    if (op === '||') return 'OR';
    if (op === '^') return 'XOR';
    return '';
  }

  evalOp(op: string, v1: boolean, v2: boolean): boolean {
    if (op === '&&') return v1 && v2;
    if (op === '||') return v1 || v2;
    if (op === '^') return (v1 ? 1 : 0) + (v2 ? 1 : 0) === 1; 
    return false;
  }

  startPolling() {
    if (this.is_polling) return;

    this.is_polling = true;
    this.esp32.setIp(this.esp32_ip);

    this.resetAllLeds();

    this.pollSubscription = timer(0, 200) 
      .pipe(
        switchMap(() =>
          this.esp32.getStatus().pipe(
            catchError(err => {
              this.is_connected = false;
              this.button_states = { boton_a: false, boton_b: false, boton_c: false };
              return EMPTY;
            })
          )
        )
      )
      .subscribe((status: ButtonStatus) => {
        this.is_connected = true;
        this.button_states = status;

        this.check_challenge_logic();
      });
  }

  ngOnDestroy() {
    this.pollSubscription?.unsubscribe();
    this.resetAllLeds(); 
  }

  resetAllLeds() {
    const allPins = [...this.led_pins_progress, this.led_pin_status];
    allPins.forEach(pin => {
      this.esp32.setLed(pin, false).subscribe();
    });
  }

  updatePhysicalProgressBar(completed_challenges: number) {
    this.led_pins_progress.forEach((pin, index) => {
      const tutorialCount = 5;
      const levelsCompleted = Math.max(0, completed_challenges - tutorialCount);

      const state = index < levelsCompleted;
      this.esp32.setLed(pin, state).subscribe();
    });
  }

  check_challenge_logic() {
    if (this.showModal) return;

    if (this.current_challenge_index >= this.challenges.length) {
      this.current_led_output = false;
      return;
    }

    const currentChallenge = this.challenges[this.current_challenge_index];

    const a = this.button_states.boton_a;
    const b = this.button_states.boton_b;
    const c = this.button_states.boton_c;

    const led_output = currentChallenge.evaluate(a, b, c);

    const success = led_output === true;

    this.current_led_output = led_output;

    if (led_output !== this.last_led_output_state) {
      this.esp32.setLed(this.led_pin_status, led_output).subscribe();
      this.last_led_output_state = led_output;
    }

    if (success) {
      if (currentChallenge.manual_advance) {
        return;
      }

      console.log(`Reto ${this.current_challenge_index} completado!`);

      this.updatePhysicalProgressBar(this.current_challenge_index + 1);

      this.showModal = true;
    }
  }

  advanceToNextLevel() {
    this.showModal = false;

    this.current_challenge_index += 1;

    this.last_led_output_state = null;
    this.esp32.setLed(this.led_pin_status, false).subscribe();
    this.current_led_output = false;
  }

  get currentChallengeObj(): Challenge {
    if (this.current_challenge_index < this.challenges.length) {
      return this.challenges[this.current_challenge_index];
    }
    return this.victoryChallenge;
  }
}
