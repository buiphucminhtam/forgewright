'use strict'
const crypto = require('crypto')
const { Readable } = require('node:stream')
const zlib = require('zlib')
const tar = require('tar')
const fs = require('fs')
const CMLog = require('./cmLog')

class Downloader {
	constructor(options) {
		this.options = options || {}
		this.log = new CMLog(this.options)
	}
	downloadToStream(url, stream, hash) {
		const self = this
		const shasum = hash ? crypto.createHash(hash) : null
		return new Promise(function (resolve, reject) {
			let length = 0
			let done = 0
			let lastPercent = 0
			fetch(url)
				.then(function (response) {
					if (!response.ok) {
						throw new Error(response.statusText || 'Request failed')
					}
					length = parseInt(response.headers.get('content-length'))
					if (Number.isNaN(length)) {
						length = 0
					}

					const readable = Readable.fromWeb(response.body)
					readable.on('data', function (chunk) {
						if (shasum) {
							shasum.update(chunk)
						}
						if (length) {
							done += chunk.length
							let percent = (done / length) * 100
							percent = Math.round(percent / 10) * 10 + 10
							if (percent > lastPercent) {
								self.log.verbose('DWNL', '\t' + lastPercent + '%')
								lastPercent = percent
							}
						}
					})

					readable.pipe(stream)
					readable.on('error', function (err) {
						reject(err)
					})
				})
				.catch(function (err) {
					reject(err)
				})

			stream.once('error', function (err) {
				reject(err)
			})

			stream.once('finish', function () {
				resolve(shasum ? shasum.digest('hex') : undefined)
			})
		})
	}
	async downloadString(url) {
		const response = await fetch(url)
		if (!response.ok) {
			throw new Error(response.statusText || 'Request failed')
		}
		return response.text()
	}
	async downloadFile(url, options) {
		if (typeof options === 'string') {
			options.path = options
		}
		const result = fs.createWriteStream(options.path)
		const sum = await this.downloadToStream(url, result, options.hash)
		this.testSum(url, sum, options)
		return sum
	}
	async downloadTgz(url, options) {
		if (typeof options === 'string') {
			options.cwd = options
		}
		const gunzip = zlib.createGunzip()
		const extractor = tar.extract(options)
		gunzip.pipe(extractor)
		const sum = await this.downloadToStream(url, gunzip, options.hash)
		this.testSum(url, sum, options)
		return sum
	}
	testSum(url, sum, options) {
		if (options.hash && sum && options.sum && options.sum !== sum) {
			throw new Error(options.hash.toUpperCase() + " sum of download '" + url + "' mismatch!")
		}
	}
}

module.exports = Downloader
