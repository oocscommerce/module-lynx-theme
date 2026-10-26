<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Observer;

use Magento\Framework\App\ActionFlag;
use Magento\Framework\App\ActionInterface;
use Magento\Framework\App\Request\Http as Request;
use Magento\Framework\App\Response\Http as Response;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use OOCS\LynxTheme\Model\ThemeFallback;

/**
 * Answers an Inertia visit to a page handed back to Magento with the one thing the client can act on
 */
class FallbackLocationVisit implements ObserverInterface
{
    private const HEADER_INERTIA  = 'X-Inertia';
    private const HEADER_LOCATION = 'X-Inertia-Location';

    /**
     * Request, response, action flag, fallback
     *
     * @param Request $request
     * @param Response $response
     * @param ActionFlag $actionFlag
     * @param ThemeFallback $fallback
     */
    public function __construct(
        private readonly Request $request,
        private readonly Response $response,
        private readonly ActionFlag $actionFlag,
        private readonly ThemeFallback $fallback,
    ) {
    }

    /**
     * Execute
     *
     * @param Observer $observer
     * @return void
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function execute(Observer $observer): void
    {
        if (!$this->request->getHeader(self::HEADER_INERTIA)
            || !$this->request->isGet()
            || !$this->fallback->isActive()
            || !$this->fallback->matches($this->request->getFullActionName())
        ) {
            return;
        }

        $this->response->setHttpResponseCode(409);
        $this->response->setHeader(self::HEADER_LOCATION, $this->request->getUriString(), true);
        $this->response->setBody('');

        $this->actionFlag->set('', ActionInterface::FLAG_NO_DISPATCH, true);
    }
}
