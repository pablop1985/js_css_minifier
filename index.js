'use strict';
const minify = require('@node-minify/core');
const csso = require('@node-minify/csso');
const uglifyES = require('@node-minify/uglify-es');
//const https = require('https');
const fs = require('fs');
const axios = require('axios');
const zlib = require('zlib');
const path = require('path');

const supportedCompression = ['gzip', 'deflate'];

exports.minificar = async(event, context, callback) => {

	console.log(event);

	let compresor = false;
	let peticion = event.Records[0].cf.request;

	//URL del archivo sin minificar
	let urlcombinada = "XXXXXX/" + path.basename(event.Records[0].cf.request.uri, path.extname(path.basename(event.Records[0].cf.request.uri)))

	console.log("URL: " + urlcombinada);

	let miURIdeco = [];

	miURIdeco[0] = urlcombinada;

	let tipoArchivo = '';

	if (/\.js$/.test(peticion.uri)) {
		tipoArchivo = 'js';
		compresor = uglifyES;
	} else if (/\.css$/.test(peticion.uri)) {
		tipoArchivo = 'css';
		compresor = csso;
	} else {
		callback(null, peticion);
		return peticion;
	}

	let min = await minifica(miURIdeco, compresor);
	const compression = detectCompression(peticion);
	let expires = new Date(new Date().getTime() + 86400000 * 365);
	let respuesta = {
		body: compressBody(min, compression),
		bodyEncoding: compression ? 'base64' : 'text',
		headers: {
			'content-type': [{
				key: 'Content-Type',
				value: 'text/plain'
			}],
			'cache-control': [{
				key: 'Cache-Control',
				value: 'public, max-age=31536000'
			}],
			'expires': [{
				key: 'expires',
				value: expires.toUTCString()
			}],
			'content-encoding': [{
				key: 'Content-Encoding',
				value: compression || 'UTF-8'
			}]

		},
		status: '200',
		statusDescription: 'OK'
	};
	switch (tipoArchivo) {
		case 'js':
			respuesta.headers['content-type'][0] = {
				key: 'Content-Type',
				value: 'text/javascript'
			};
			break;
		case 'css':
			respuesta.headers['content-type'][0] = {
				key: 'Content-Type',
				value: 'text/css'
			};
			break;
	}

	callback(null, respuesta);
};

async function minifica(uris, compresor) {
	return new Promise((resolve, reject) => {
		fs.writeFile('/tmp/origen.txt', '', { flag: 'w' }, (err) => {
			if (err) {
				reject(err);
			}
			new Promise((resolve, reject) => {
				let contadorUris = uris.length;
				let cadenaFinal = [];
				let contadorCadenas = [];
				uris.forEach(async(uri, contador) => {
					console.log("Llamando a " + uri);
					await axios.get(uri).then(async(response) => {
						await fs.writeFile('/tmp/origen_' + contador + '.txt', response.data, { flag: 'w' }, (err) => {
							if (err) {
								reject(err);
							} else {
								console.log("Minificando " + contador + " " + uri);
								minify({
									compressor: compresor,
									input: '/tmp/origen_' + contador + '.txt',
									output: '/tmp/salida' + contador + '.txt'
								}).then((min) => {
									cadenaFinal[contador] = '/*' + (contador + 1) + ' | ' + uri + '*/\n' + min;
									contadorCadenas.push(contador);
									if (contadorUris == contadorCadenas.length) {
										resolve(cadenaFinal.join('\n'));
									} else {
										console.log(cadenaFinal.length + ' de ' + contadorUris);
									}
								}).catch((err) => {
									reject(err);
								});
							}
						});
					}).catch((err) => {
						reject(err);
					});
				});
			}).then((cadenaFinalJH) => {
				resolve(cadenaFinalJH);
			});
		});

	});

}

function detectCompression(request) {
	const accept = request.headers['accept-encoding'] || [];
	for (var i = 0; i < accept.length; i++) {
		if (supportedCompression.indexOf(accept[i].value) !== -1) {
			return accept[i].value; // return the first match
		}
	}
	return null;
}

function compressBody(body, compression) {
	if (compression === 'gzip') {
		return zlib.gzipSync(body).toString('base64');
	} else if (compression === 'deflate') {
		return zlib.deflateSync(body).toString('base64');
	} else {
		return body; // no compression
	}
}