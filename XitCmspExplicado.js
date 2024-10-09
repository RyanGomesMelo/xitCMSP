// ==UserScript==
// @name         xit cmsp
// @namespace    https://cmspweb.ip.tv/
// @version      1.0
// @description  hmmmm cheeto
// @connect      cmsp.ip.tv
// @connect      edusp-api.ip.tv
// @author       Ryan
// @match        https://cmsp.ip.tv/*
// @icon         https://edusp-static.ip.tv/permanent/66aa8b3a1454f7f2b47e21a3/full.x-icon
// @license      GNU Affero General Public License v3.0
// ==/UserScript==

(function() {
    'use strict';

    // Expressão regular para identificar URLs de lições específicas
    let lesson_regex = /https:\/\/cmsp\.ip\.tv\/mobile\/tms\/task\/\d+\/apply/;
    console.log("-- Xit Iniciado  --");

    // Função que transforma o JSON original em um novo formato
    function transformJson(jsonOriginal) {
        // Novo JSON com os campos modificados
        let novoJson = {
            status: "submitted", // Status modificado para "submitted"
            accessed_on: jsonOriginal.accessed_on,
            executed_on: jsonOriginal.executed_on,
            answers: {} // Respostas vazias que serão preenchidas
        };

        // Loop sobre cada resposta no JSON original
        for (let questionId in jsonOriginal.answers) {
            let question = jsonOriginal.answers[questionId];
            let taskQuestion = jsonOriginal.task.questions.find(q => q.id === parseInt(questionId));

            // Caso a questão seja do tipo "order-sentences"
            if (taskQuestion.type === "order-sentences") {
                let answer = taskQuestion.options.sentences.map(sentence => sentence.value);
                novoJson.answers[questionId] = {
                    question_id: question.question_id,
                    question_type: taskQuestion.type,
                    answer: answer
                };
            }
            // Caso a questão seja do tipo "fill-words"
            else if (taskQuestion.type === "fill-words") {
                let pre_anwser = taskQuestion.options;
                let anwser = pre_anwser.phrase.map(item => item.value);
                novoJson.answers[questionId] = {
                    question_id: question.question_id,
                    question_type: taskQuestion.type,
                    answer: anwser
                };
            }
            // Caso a questão seja do tipo "text_ai"
            else if (taskQuestion.type === "text_ai") {
                let answer = taskQuestion.comment.replace(/<\/?p>/g, ''); // Remove tags <p> do texto
                novoJson.answers[questionId] = {
                    question_id: question.question_id,
                    question_type: taskQuestion.type,
                    answer: { "0": answer }
                };
            }
            // Caso a questão seja do tipo "fill-letters"
            else if (taskQuestion.type === "fill-letters") {
                let answer = taskQuestion.options.answer;
                novoJson.answers[questionId] = {
                    question_id: question.question_id,
                    question_type: taskQuestion.type,
                    answer: answer
                };
            }
            // Caso a questão seja do tipo "cloud"
            else if (taskQuestion.type === "cloud") {
                let answer = taskQuestion.options.ids;
                novoJson.answers[questionId] = {
                    question_id: question.question_id,
                    question_type: taskQuestion.type,
                    answer: answer
                };
            }
            // Para outros tipos de questões
            else {
                let answer = Object.fromEntries(
                    Object.keys(taskQuestion.options).map(optionId => [optionId, taskQuestion.options[optionId].answer])
                );
                novoJson.answers[questionId] = {
                    question_id: question.question_id,
                    question_type: taskQuestion.type,
                    answer: answer
                };
            }
        }
        return novoJson;
    }

    // Salva o valor da URL atual
    let oldHref = document.location.href;

    // Observador de mudanças no DOM (caso a URL mude)
    const observer = new MutationObserver(() => {
        // Se a URL mudar
        if (oldHref !== document.location.href) {
            oldHref = document.location.href;

            // Verifica se a nova URL corresponde à de uma lição
            if (lesson_regex.test(oldHref)) {
                console.log("[DEBUG] LESSON DETECTED");

                // Obtém o token de autenticação e o nome da sala de sessão
                let x_auth_key = JSON.parse(sessionStorage.getItem("cmsp.ip.tv:iptvdashboard:state")).auth.auth_token;
                let room_name = JSON.parse(sessionStorage.getItem("cmsp.ip.tv:iptvdashboard:state")).room.room.name;
                let id = oldHref.split("/")[6];
                console.log(`[DEBUG] LESSON_ID: ${id} ROOM_NAME: ${room_name}`);

                // Corpo da requisição inicial em estado de "draft"
                let draft_body = {
                    status: "draft",
                    accessed_on: "room",
                    executed_on: room_name,
                    answers: {}
                };

                // Função para fazer requisições HTTP (GET/POST/PUT)
                const sendRequest = (method, url, data, callback) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open(method, url);
                    xhr.setRequestHeader("X-Api-Key", x_auth_key); // Insere o token de autenticação
                    xhr.setRequestHeader("Content-Type", "application/json");
                    xhr.onload = () => callback(xhr);
                    xhr.onerror = () => console.error('Request failed');
                    xhr.send(data ? JSON.stringify(data) : null);
                };

                // Envia a requisição para salvar o rascunho da resposta
                sendRequest("POST", `https://edusp-api.ip.tv/tms/task/${id}/answer`, draft_body, (response) => {
                    console.log("[DEBUG] DRAFT_DONE, RESPONSE: ", response.responseText);
                    let response_json = JSON.parse(response.responseText);
                    let task_id = response_json.id;

                    // URL para buscar as respostas da tarefa
                    let get_anwsers_url = `https://edusp-api.ip.tv/tms/task/${id}/answer/${task_id}?with_task=true&with_genre=true&with_questions=true&with_assessed_skills=true`;

                    console.log("[DEBUG] Getting Answers...");

                    // Faz a requisição para obter as respostas
                    sendRequest("GET", get_anwsers_url, null, (response) => {
                        console.log(`[DEBUG] Get Answers request received response`);
                        let get_anwsers_response = JSON.parse(response.responseText);

                        // Transforma o JSON original das respostas
                        let send_anwsers_body = transformJson(get_anwsers_response);
                        console.log(`[DEBUG] Sending Answers... BODY: ${JSON.stringify(send_anwsers_body)}`);

                        // Envia as respostas modificadas
                        sendRequest("PUT", `https://edusp-api.ip.tv/tms/task/${id}/answer/${task_id}`, send_anwsers_body, (response) => {
                            if (response.status !== 200) {
                                alert(`[ERROR] An error occurred while sending the answers. RESPONSE: ${response.responseText}`);
                            }
                            console.log(`[DEBUG] Answers Sent! RESPONSE: ${response.responseText}`);

                            // Modifica a marca d'água da página com o texto "Xit do Ryan"
                            const watermark = document.querySelector('.MuiTypography-root.MuiTypography-body1.css-1exusee');
                            if (watermark) {
                                watermark.textContent = 'Xit do Ryan';
                                watermark.style.fontSize = '70px';
                                
                                // Clica em um botão específico da interface após um intervalo
                                setTimeout(() => {
                                    document.querySelector('button.MuiButtonBase-root.MuiButton-root.MuiLoadingButton-root.MuiButton-contained.MuiButton-containedInherit.MuiButton-sizeMedium.MuiButton-containedSizeMedium.MuiButton-colorInherit.css-prsfpd').click();
                                }, 500);
                            }
                        });
                    });
                });
            }
        }
    });

    // Inicia a observação de mudanças no DOM
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
