//// tokenizer

const tokenizeErrorCount = 10000;
const symbolPattern = /[a-zA-Z\+-\/\*=:><\?!0-9]/;
const symbolStartPattern = /[a-zA-Z\+-\/\*=:><\?!]/;

function tokenize(src) {
  let lenv = {
    s: src, // source
    c: null, // current character
    c2: null, // next character
    i: -1, // current position
    b: "", // buffer
    n: 0, // total read count
    t: [],
  };

  while (read(lenv)) {
    if (isDelimiter(lenv.c)) {
      skip(lenv);
    } else if (lenv.c === "(") {
      pushb(lenv);
      accept(lenv, "LP");
    } else if (lenv.c === ")") {
      pushb(lenv);
      accept(lenv, "RP");
    } else if (lenv.c === '"') {
      readString(lenv);
    } else if (
      lenv.c.match(/[0-9]/) ||
      (lenv.c === "-" && lenv.c2.match(/[0-9]/))
    ) {
      readNumber(lenv);
    } else if (lenv.c === "'") {
      readQuote(lenv);
    } else if (lenv.c.match(symbolStartPattern)) {
      readSymbol(lenv);
    } else {
      throw new Error(`syntax error at character ${lenv.i}`);
    }
  }

  return lenv.t;
}

function isDelimiter(c) {
  return c === " " || c === "\n";
}

function read(lenv) {
  lenv.n++;
  if (lenv.n > tokenizeErrorCount) return false;
  lenv.i++;
  if (lenv.i >= lenv.s.length) return false;
  lenv.c = lenv.s[lenv.i];
  lenv.c2 = lenv.s[lenv.i + 1];
  return true;
}

function back(lenv) {
  lenv.i--;
}

function skip(lenv) {}

function accept(lenv, cls) {
  lenv.t.push({ cls: cls, text: lenv.b });
  lenv.b = "";
}

function pushb(lenv) {
  lenv.b = lenv.b + lenv.c;
}

function readQuote(lenv) {
  while (read(lenv)) {
    if (lenv.c.match(symbolPattern)) {
      pushb(lenv);
    } else {
      accept(lenv, "QTE");
      back(lenv);
      return;
    }
  }
}

function readSymbol(lenv) {
  pushb(lenv);
  while (read(lenv)) {
    if (lenv.c.match(symbolPattern)) {
      pushb(lenv);
    } else {
      accept(lenv, "SYM");
      back(lenv);
      return;
    }
  }
}

function readNumber(lenv) {
  pushb(lenv);
  while (read(lenv)) {
    if (lenv.c.match(/[0-9\.]/)) {
      pushb(lenv);
    } else {
      accept(lenv, "NUM");
      back(lenv);
      return;
    }
  }
}

function readString(lenv) {
  let escape = false;
  while (read(lenv)) {
    if (lenv.c === '"') {
      if (escape) {
        pushb(lenv);
        escape = false;
      } else {
        accept(lenv, "STR");
        return;
      }
    } else if (lenv.c === "\\") {
      if (escape) {
        pushb(lenv);
        escape = false;
      } else {
        escape = true;
      }
    } else {
      pushb(lenv);
    }
  }
}

//// parser

const parseErrorCount = 10000;

function parse(tokens) {
  let root = createNode();
  root.ts.push({ cls: "SYM", text: "progn" });
  let penv = {
    t: null, // current token
    s: tokens, // tokens
    c: [root], // current ast
    r: root, // root ast
    i: -1, // current index
    n: 0, // total read count
  };

  while (next(penv)) {
    if (penv.t.cls === "LP") {
      openNode(penv);
    } else if (penv.t.cls === "RP") {
      closeNode(penv);
    } else {
      penv.c[0].ts.push(penv.t);
    }
  }

  return penv.r;
}

function createNode() {
  return { cls: "AST", ts: [] };
}

function openNode(penv) {
  let node = createNode();
  penv.c[0].ts.push(node);
  penv.c.unshift(node);
}

function closeNode(penv) {
  penv.c.shift();
}

function next(penv) {
  penv.n++;
  if (penv.n > parseErrorCount) return false;
  penv.i++;
  if (penv.i >= penv.s.length) return false;
  penv.t = penv.s[penv.i];
  return true;
}

function printAst(ast, depth = 0, s = []) {
  ast.ts.forEach((n) => {
    if (n.cls === "AST") {
      printAst(n, depth + 1, s);
    } else {
      s.push("  ".repeat(depth) + n.text);
    }
  });
  return s.join("\n");
}

//// evaluator

function createEenv() {
  let baseContext = {
    //progn: (eenv, ...args) => args[args.length - 1],
    print: (eenv, ...args) => console.log(...args),
    "+": (eenv, ...args) => args.slice(1).reduce((m, x) => m + x, args[0]),
    "-": (eenv, ...args) => args.slice(1).reduce((m, x) => m - x, args[0]),
    "*": (eenv, ...args) => args.slice(1).reduce((m, x) => m * x, args[0]),
    "/": (eenv, ...args) => args.slice(1).reduce((m, x) => m / x, args[0]),
    ">": (eenv, ...args) => args[0] > args[1],
    ">=": (eenv, ...args) => args[0] >= args[1],
    "<": (eenv, ...args) => args[0] < args[1],
    "<=": (eenv, ...args) => args[0] <= args[1],
    "===": (eenv, ...args) => args[0] === args[1],
    "!==": (eenv, ...args) => args[0] !== args[1],
    "==": (eenv, ...args) => args[0] == args[1],
    "!=": (eenv, ...args) => args[0] != args[1],
    "!": (eenv, ...args) => !args[0],
  };
  let eenv = {
    c: [baseContext], // current context
  };
  return eenv;
}

function resolve(sym, eenv) {
  for (let i = 0; i < eenv.c.length; i++) {
    let c = eenv.c[i];
    if (sym in c) return c[sym];
  }
  throw new Error(`symbol "${sym}" is not defined`);
}

function pushContext(eenv) {
  let newctx = {};
  eenv.c.unshift(newctx);
  return newctx;
}

function popContext(eenv) {
  eenv.c.shift();
}

function curContext(eenv) {
  return eenv.c[0];
}

function intern(eenv, sym, val) {
  curContext(eenv)[sym] = val;
}

function assign(eenv, sym, val) {
  for (let i = 0; i < eenv.c.length; i++) {
    let c = eenv.c[i];
    if (sym in c) {
      c[sym] = val;
      return;
    }
  }
  throw new Error(`symbol "${sym}" is not defined`);
}

function wrapProgn(ast) {
  let node = createNode();
  node.ts.push({ cls: "SYM", text: "progn" });
  node.ts.push(ast);
  return node;
}

function evaluate(ast, eenv = createEenv()) {
  if (ast.cls === "AST") {
    if (ast.ts[0].cls === "SYM" && ast.ts[0].text === "progn") {
      pushContext(eenv);
      let ret = undefined;
      ast.ts.slice(1).forEach((t) => {
        ret = evaluate(t, eenv);
      });
      popContext(eenv);
      return ret;
    } else if (ast.ts[0].cls === "SYM" && ast.ts[0].text === "fn") {
      let prms = ast.ts[1].ts;
      let fn = (eenv, ...args) => {
        pushContext(eenv);
        prms.forEach((x, i) => {
          intern(eenv, x.text, args[i]);
        });
        let ret = evaluate(ast.ts[2], eenv);
        popContext(eenv);
        return ret;
      };
      return fn;
    } else if (ast.ts[0].cls === "SYM" && ast.ts[0].text === "if") {
      if (evaluate(ast.ts[1], eenv) === true) {
        return evaluate(wrapProgn(ast.ts[2]), eenv);
      } else if (ast.ts.length === 4) {
        return evaluate(wrapProgn(ast.ts[3]), eenv);
      }
    } else if (ast.ts[0].cls === "SYM" && ast.ts[0].text === "++") {
      intern(eenv, ast.ts[1].text, evaluate(ast.ts[1], eenv) + 1);
    } else if (ast.ts[0].cls === "SYM" && ast.ts[0].text === "--") {
      intern(eenv, ast.ts[1].text, evaluate(ast.ts[1], eenv) - 1);
    } else if (ast.ts[0].cls === "SYM" && ast.ts[0].text === "=") {
      let val = evaluate(ast.ts[2], eenv);
      assign(eenv, ast.ts[1].text, val);
      return val;
    } else if (ast.ts[0].cls === "SYM" && ast.ts[0].text === "let") {
      let val = ast.ts.length === 3 ? evaluate(ast.ts[2], eenv) : undefined;
      intern(eenv, ast.ts[1].text, val);
      return val;
    } else if (ast.ts[0].cls === "SYM" && ast.ts[0].text === "for") {
      pushContext(eenv);
      // vars
      let varSym = null;
      ast.ts[1].ts[0].ts.forEach((t, i) => {
        if (i % 2 === 0) {
          varSym = t.text;
        } else {
          intern(eenv, varSym, evaluate(t, eenv));
        }
      });

      // loop
      let ret = undefined;
      while (evaluate(ast.ts[1].ts[1], eenv) === true) {
        ret = evaluate(ast.ts[2], eenv);
        evaluate(ast.ts[1].ts[2], eenv);
      }
      popContext(eenv);
      return ret;
    } else {
      let expr = [];
      ast.ts.forEach((t) => {
        expr.push(evaluate(t, eenv));
      });
      return expr[0](eenv, ...expr.slice(1));
    }
  } else {
    if (ast.cls === "SYM") {
      return resolve(ast.text, eenv);
    } else if (ast.cls === "NUM") {
      return Number(ast.text);
    } else if (ast.cls === "STR") {
      return ast.text;
    } else if (ast.cls === "QTE") {
      throw new Error("Quote is not supported yet");
    } else {
      throw new Error(`Unknown class ${ast.cls}`);
    }
  }
}

function run(script) {
  evaluate(parse(tokenize(script)));
}

let script = `

(let helloworld (fn (x) (print (+ "hello, " x))))
(helloworld "testuser")

(let fact (fn (k n) 
  (for ((i 1 m k) (< i n) (++ i))
    (= m (* m k)))))
(print (fact 2 3))

(let fact2 (fn (k n) (if (=== n 0) 1 (* k (fact2 k (- n 1))))))
(print (fact2 3 3))

`;

run(script);

// console.log(script);
// let tokens = tokenize(script);
// tokens.forEach((t) => console.log(t));
//
// let ast = parse(tokens);
// console.log(printAst(ast));
//
// evaluate(ast);
