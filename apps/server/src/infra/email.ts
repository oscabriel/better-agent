interface VerificationCodeEmailProps {
	otp: string;
}

export const renderVerificationCodeEmail = async (
	otp: string,
): Promise<string> => {
	return generateVerificationCodeEmail({ otp });
};

const generateVerificationCodeEmail = ({
	otp,
}: VerificationCodeEmailProps): string => {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Verification Code</title>
</head>
<body style="${getMainStyles()}">
	<div style="display: none;">Your verification code: ${otp}</div>
	<div style="${getContainerStyles()}">
		<h1 style="${getH1Styles()}">Verification Code</h1>
		<p style="${getTextStyles()}">
			Here is your verification code to sign in to your account:
		</p>
		<div style="${getCodeContainerStyles()}">
			<p style="${getCodeStyles()}">${otp}</p>
		</div>
		<p style="${getTextStyles()}">
			This code will expire in 10 minutes. If you didn't request this code,
			you can safely ignore this email.
		</p>
		<p style="${getFooterStyles()}">
			Best regards,<br>
			Oscar Gabriel
		</p>
	</div>
</body>
</html>`;
};

const getMainStyles = () => `
	background-color: #ffffff;
	font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;
	margin: 0;
	padding: 0;
`;

const getContainerStyles = () => `
	margin: 0 auto;
	padding: 20px 0 48px;
	max-width: 560px;
`;

const getH1Styles = () => `
	color: #333;
	font-size: 24px;
	font-weight: 600;
	line-height: 40px;
	margin: 0 0 20px;
`;

const getTextStyles = () => `
	color: #333;
	font-size: 16px;
	line-height: 24px;
	margin: 0 0 20px;
`;

const getCodeContainerStyles = () => `
	background: #f6f9fc;
	border-radius: 4px;
	margin: 16px 0;
	text-align: center;
	padding: 20px;
`;

const getCodeStyles = () => `
	color: #000;
	font-size: 32px;
	font-weight: 700;
	letter-spacing: 6px;
	line-height: 40px;
	margin: 0;
	font-family: monospace;
`;

const getFooterStyles = () => `
	color: #8898aa;
	font-size: 12px;
	line-height: 16px;
	margin: 20px 0 0;
`;

export { generateVerificationCodeEmail as VerificationCodeEmail };
