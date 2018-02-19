let ws = require('ws');

/**** Серверная часть интерфейса web-events ****/
function events(server, evs) {

    let 
        // Создаём WebSocket-сервер
        wss = new ws.Server({ server }),

        // Объект с открытыми подключениями вида { uid: socket }
        connections = {};

    /* 
        Функция, возвращающая уникальный ключ 
        для переданного в качестве аргумента объекта
    */
    function getUniqueKey(object) {
        let key = Math.random().toString().slice(2);
        for (let key in object)
            if (object[key] == key)
                return getUniqueKey(object);
        return key;
    }

    /*
        Обёртка над пользовательским событием

        Позволяет выполнять отправку ответа на вызванное событие 
        (обработчиком которого является func с аргументами args) 
        через return самого обработчика. 

        Ответ будет доставлен инициатору события - client
    */
    function returnEmit(func, client, args) {
        let returnValue = func.apply(client, args);

        if (typeof returnValue != "object")
            return; // Если возвращен примитив, игнорируем

        let eventName; // Имя вызываемого на другой стороне события
            //args;      // Аргументы вызова

        if (returnValue instanceof Array) {
            /*
                Из обработчика был возвращён массив => первый его элемент  
                является типом вызываемого события, а остальные - аргументами
            */
            eventName = returnValue[0];
            args = returnValue.slice(1);
        } else {
            /*
                Из обработчика бы возвращен объект
                В свойстве type этого объекта должен быть указан тип события, 
                а остальные свойства будут именованными аргументами
            */
            eventName = returnValue.type;
            delete args.type; // Убираем свойство type из аргументов
        }

        // Вызываем событие на другой стороне соединения
        client.emit(eventName, args);
    }

    /*
        Вызывает событие на другой стороне соединения
        
        Эта функция привязывается к контексту к объекта клиента
        с ключом uid, чтобы однозначно идентифицировать socket
        в объекте открытых соединений connections

        eventName - название вызываемого события
        args      - аргументы

        Аргументы можно перечислять через зяпятую. В этом случае
        порядок будет сохранён при вызове соответствующего обработчика
        на другой стороне соединения
        Также можно в качестве args передать единственный объект, в этом 
        случае клиент получит один объект целиком
    */
    function emit(eventName, ...args) {

        if (args.length == 1 && typeof args[0] == 'object')
            args = args[0]; // Если аргументы были переданы через объект (массив)

        connections[this.uid].send(JSON.stringify({
            type: eventName,
            args: args
        }));
    } 

    /*
        Закрывает соединение с клиентом
        Вызывается в контексте объета клиента
    */
    function close() {
        connections[this.uid].close();
    }

    /* 
        Возникает перед отправкой ответа
        об установке WebSocket соединения
    */
    wss.on('headers', (headers, req) => {
        /**** Тут рабатывает событие 'headers' ****/

        if (evs.headers) // Доступны только headers и req
            returnEmit(evs.headers, headers, req);
    });

    /**** Ожидаем подключения ****/
    wss.on('connection', (ws, req) => {

        // Выдаём новому подключившемуся клиенту уникальный ключ
        let client = {
            uid: getUniqueKey(connections),
            emit: emit,
            close: close
        };

        // Сохраняем сокет активного клиента под его uid
        connections[client.uid] = ws;

        /*
            После установки соединения с новым клиентом
            вызываем обработчик 'connection' на сервере,
            если таковой был определён
        */
        if (evs.connection)
            returnEmit(evs.connection, client, ws, req);

        ws.on('message', data => {
            // Предполагается, что данные приходят в JSON-формате
            try {
                data = JSON.parse(data);
            } catch(e) { return; }

            // В свойстве type указывается тип события
            if (typeof data.type != 'string')
                return;

            /*
                Формат: от клиента приходит JSON-объект
                data.type - тип события
                data.args - объект аргументов
            */
            
            // Вызываем пользовательское событие, если оно было объявлено
            if (evs[data.type])
                returnEmit(evs[data.type], client, data.args);

        });

        ws.on('error', function() {console.log('error!')}); // Заглушка

        ws.on('close', (code, reason) => {console.log('close!');
            /*
                Вызываем обработчик закрытия соединения, 
                если таковой имеется
            */
            if (evs.close)
                returnEmit(evs.close, client, [code, reason]);
        });

    });
        
}

module.exports = events;