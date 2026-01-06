const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const uploadBufferToS3 = async (
  buffer,
  fileName,
  folder = 'enhanced',
  mimeType = 'image/png'
) => {
  const key = `${folder}/${Date.now()}-${fileName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      // ACL: 'public-read',
    })
  );

  return {
    key,
    url: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
  };
};

module.exports = uploadBufferToS3;
