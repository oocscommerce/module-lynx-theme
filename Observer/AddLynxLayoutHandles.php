<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Observer;

use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Framework\View\LayoutInterface;
use OOCS\LynxTheme\Helper\Theme as ThemeHelper;

/**
 * When the OOCS/Lynx theme (or a child of it) is active
 */
class AddLynxLayoutHandles implements ObserverInterface
{
    public const HANDLE_PREFIX = 'lynx_';

    /**
     * Theme helper
     *
     * @param ThemeHelper $themeHelper
     */
    public function __construct(
        private readonly ThemeHelper $themeHelper,
    ) {
    }

    /**
     * Execute
     *
     * @param Observer $observer
     * @return void
     */
    public function execute(Observer $observer): void
    {
        if (!$this->themeHelper->isLynxTheme()) {
            return;
        }

        /** @var LayoutInterface $layout */
        $layout = $observer->getEvent()->getLayout();
        $update = $layout->getUpdate();

        foreach ($update->getHandles() as $handle) {
            if (!str_starts_with($handle, self::HANDLE_PREFIX)) {
                $update->addHandle(self::HANDLE_PREFIX . $handle);
            }
        }
    }
}
