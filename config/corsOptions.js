const allowedOrigins = [
	"http://localhost:5173",
	"http://localhost:8080",
	"http://3.21.77.121.nip.io"
];

const corsOptions = {
	origin: (origin, callback) => {
		if (
			allowedOrigins.indexOf(origin) !== -1 ||
			process.env.NODE_ENV === "development" ||
			!origin
		) {
			callback(null, true);
		} else {
			callback(new Error("Not allowed by CORS"));
		}
	},
	credentials: true,
};

module.exports = corsOptions;
